// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click 'Start Recording' to begin.");
  const [savedTranscripts, setSavedTranscripts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

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
  }, [fetchTranscripts]);

  const startRecording = useCallback(async () => {
    setStatusMessage("Initializing...");
    audioChunks.current = []; // Clear previous chunks

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstart = () => {
        setIsRecording(true);
        setStatusMessage("Recording... Click 'Stop' to transcribe.");
      };

      mediaRecorder.current.onstop = async () => {
        setStatusMessage("Processing audio...");
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });

        // Use FormData to send the file
        const formData = new FormData();
        formData.append("audio_file", audioBlob, "recording.webm");

        try {
          // Send audio to the new transcription endpoint
          const transcribeResponse = await fetch("http://localhost:8000/api/transcribe", {
            method: 'POST',
            body: formData,
          });

          if (!transcribeResponse.ok) {
            throw new Error(`Transcription failed: ${await transcribeResponse.text()}`);
          }

          const result = await transcribeResponse.json();
          const finalTranscript = result.transcript;
          setStatusMessage("Transcription complete. Saving...");

          // Now save the received transcript text
          const saveResponse = await fetch("http://localhost:8000/api/transcripts", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: finalTranscript }),
          });

          if (saveResponse.ok) {
            setStatusMessage("Saved! Ready to start new recording.");
            fetchTranscripts(); // Refresh the list of saved transcripts
          } else {
            throw new Error("Failed to save transcript.");
          }
        } catch (error) {
          console.error("Error during transcription/saving:", error);
          setStatusMessage(`Error: ${error.message}`);
        }

        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      mediaRecorder.current.start();
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatusMessage("Could not start recording. Please allow microphone access.");
      setIsRecording(false);
    }
  }, [fetchTranscripts]);

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
        <h1>Voice-to-Text Transcriber (Gemini)</h1>
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