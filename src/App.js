// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click 'Start Recording' to begin.");
  const [savedTranscripts, setSavedTranscripts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  const mediaRecorder = useRef(null);
  const uploadInterval = useRef(null);
  const pollingInterval = useRef(null);
  const sessionId = useRef(null);

  const fetchTranscripts = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:8000/api/transcripts");
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setSavedTranscripts(data);
    } catch (error) {
      console.error("Failed to fetch transcripts:", error);
    }
  }, []);

  useEffect(() => {
    fetchTranscripts();
    // Cleanup intervals on component unmount
    return () => {
      clearInterval(uploadInterval.current);
      clearInterval(pollingInterval.current);
    };
  }, [fetchTranscripts]);

  const pollForTranscript = useCallback((taskId) => {
    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/transcription-status/${taskId}`);
        if (!response.ok) {
          throw new Error("Polling request failed");
        }
        const data = await response.json();

        if (data.status === "complete") {
          clearInterval(pollingInterval.current);
          setStatusMessage("Transcription complete! Refreshing list...");
          fetchTranscripts(); // The result is already in the DB, just refresh the list
        } else if (data.status === "failed") {
          clearInterval(pollingInterval.current);
          setStatusMessage(`Error: Transcription failed. ${data.error}`);
        } else {
          // Still pending, just update the status message
          setStatusMessage("Processing in background... This may take several minutes for long recordings.");
        }
      } catch (error) {
        console.error("Polling error:", error);
        clearInterval(pollingInterval.current);
        setStatusMessage("Error: Could not get transcription status.");
      }
    }, 5000); // Poll every 5 seconds
  }, [fetchTranscripts]);
  
  const uploadChunk = useCallback(async (blob) => {
    if (!blob) return;
    const formData = new FormData();
    formData.append("session_id", sessionId.current);
    formData.append("chunk_index", 0); // We send the whole file as one chunk now at the end
    formData.append("audio_chunk", blob, `recording.webm`);

    // For simplicity in this final version, we'll revert to a single large upload
    // but the backend is ready for chunking if you re-implement the interval.
    // The key change is the async background task handling.
  }, []);


  const startRecording = useCallback(async () => {
    setStatusMessage("Initializing...");
    sessionId.current = uuidv4();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Record into a single blob
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.current = recorder;
      let localAudioChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          localAudioChunks.push(event.data);
        }
      };
      
      recorder.onstart = () => {
        setIsRecording(true);
        setStatusMessage("Recording... Click 'Stop' to process.");
      };

      recorder.onstop = async () => {
        setStatusMessage("Uploading audio file... Please wait.");
        const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });

        const formData = new FormData();
        formData.append("session_id", sessionId.current);
        // We send the whole file as a single "chunk" to a temporary file
        formData.append("chunk_index", 0);
        formData.append("audio_chunk", audioBlob, `chunk_0.webm`);
        
        try {
          // 1. Upload the entire file as the first and only chunk
          await fetch("http://localhost:8000/api/upload-chunk", { method: 'POST', body: formData });
          
          // 2. Tell the backend to start the background job
          const finalizeResponse = await fetch("http://localhost:8000/api/finalize-recording", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId.current }),
          });

          if (!finalizeResponse.ok) {
            throw new Error(`Failed to start transcription job: ${await finalizeResponse.text()}`);
          }
          
          const { task_id } = await finalizeResponse.json();
          setStatusMessage("File uploaded. Transcription is processing in the background.");
          
          // 3. Start polling for the result
          pollForTranscript(task_id);

        } catch (error) {
          console.error("Error during upload/finalization:", error);
          setStatusMessage(`Error: ${error.message}`);
        }
        
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      recorder.start();
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatusMessage("Could not start recording. Please allow microphone access.");
    }
  }, [pollForTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
  }, []);
  
  const handleUpdate = useCallback(async () => {
    if (!editingId) return;
    try {
      const response = await fetch(`http://localhost:8000/api/transcripts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (response.ok) {
        setEditingId(null);
        fetchTranscripts();
      } else {
        console.error("Failed to update transcript");
      }
    } catch (error) {
      console.error("Error updating transcript:", error);
    }
  }, [editingId, editContent, fetchTranscripts]);

  return (
    <div className="App">
      <div className="main-recorder">
        <h1>Professional Voice Transcriber</h1>
        <div className="buttons-container">
          {!isRecording ? (
            <button onClick={startRecording}>Start Recording</button>
          ) : (
            <button onClick={stopRecording}>Stop Recording</button>
          )}
        </div>
        <div className="transcript-container">
          <h2>Status:</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{statusMessage}</p>
        </div>
      </div>
      <div className="saved-transcripts">
        <h2>Saved Recordings</h2>
        {savedTranscripts.length > 0 ? (
          savedTranscripts.map((item) => (
            <div key={item.id} className="transcript-card">
              <p className="transcript-date">
                Saved on: {new Date(item.created_at).toLocaleString()}
              </p>
              {editingId === item.id ? (
                <div className="edit-area">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                  />
                  <button onClick={handleUpdate}>Save</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <p className="transcript-content">{item.content}</p>
                  <button onClick={() => {
                    setEditingId(item.id);
                    setEditContent(item.content);
                  }}>Edit</button>
                </>
              )}
            </div>
          ))
        ) : (
          <p>No saved transcripts yet. Make a recording to see it here!</p>
        )}
      </div>
    </div>
  );
}

export default App;