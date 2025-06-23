// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  // === NEW STATE FOR SAVED TRANSCRIPTS ===
  const [savedTranscripts, setSavedTranscripts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  
  const fullTranscript = useRef("");
  const socket = useRef(null);
  const mediaRecorder = useRef(null);

  // === NEW FUNCTION TO FETCH TRANSCRIPTS ===
  const fetchTranscripts = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:8000/api/transcripts");
      const data = await response.json();
      setSavedTranscripts(data);
    } catch (error) {
      console.error("Failed to fetch transcripts:", error);
    }
  }, []);

  // === NEW useEffect TO FETCH ON LOAD ===
  // This runs once when the component first loads.
  useEffect(() => {
    fetchTranscripts();
  }, [fetchTranscripts]);


  const startRecording = useCallback(async () => {
    // ... (This function remains unchanged)
    setIsRecording(true);
    setTranscript(""); 
    fullTranscript.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.current && socket.current.readyState === WebSocket.OPEN) {
          socket.current.send(event.data);
        }
      };

      socket.current = new WebSocket("ws://localhost:8000/ws");

      socket.current.onopen = () => {
        setTranscript("Connected. Listening...");
        mediaRecorder.current.start(1000); 
      };

      socket.current.onmessage = (event) => {
        const receivedText = event.data;
        setTranscript(prev => prev + receivedText);
        fullTranscript.current += receivedText;
      };

      socket.current.onclose = () => {
        setIsRecording(false);
        if (mediaRecorder.current) {
            stream.getTracks().forEach(track => track.stop());
        }
      };

      socket.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsRecording(false);
      };

    } catch (error) {
      console.error("Error in startRecording:", error);
      setIsRecording(false);
    }
  }, []);

  const handleEdit = useCallback(async () => {
  if (!editingId || !editContent) return;
  
  try {
    const response = await fetch(`http://localhost:8000/api/transcripts/${editingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: editContent }),
    });

    if (response.ok) {
      setSavedTranscripts(prev => 
        prev.map(item => 
          item.id === editingId 
            ? {...item, content: editContent} 
            : item
        )
      );
      setEditingId(null);
      setEditContent("");
    } else {
      console.error("Failed to update transcript");
    }
  } catch (error) {
    console.error("Error updating transcript:", error);
  }
}, [editingId, editContent]);

  const stopRecording = useCallback(async () => {
    // ... (This function is mostly unchanged, but now it re-fetches the list)
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
    if (socket.current) {
      socket.current.close(1000, "User clicked stop");
    }

    if (fullTranscript.current.trim().length > 0) {
      setTranscript("Saving...");
      try {
        const response = await fetch("http://localhost:8000/api/transcripts", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: fullTranscript.current }),
        });

        if (response.ok) {
          setTranscript("Saved!");
          // === RE-FETCH THE LIST AFTER SAVING ===
          fetchTranscripts(); 
        } else {
          setTranscript("Failed to save.");
        }
      } catch (error) {
        console.error("Error saving transcript:", error);
        setTranscript("Error saving.");
      }
    }
  }, [fetchTranscripts]);

  return (
    <div className="App">
      <div className="main-recorder">
        <h1>Voice-to-Text Transcriber</h1>
        <div className="buttons-container">
          {!isRecording ? (
            <button onClick={startRecording}>Start Recording</button>
          ) : (
            <button onClick={stopRecording}>Stop Recording</button>
          )}
        </div>
        <div className="transcript-container">
          <h2>Live Transcript:</h2>
          <div style={{ whiteSpace: 'pre-wrap' }}>{transcript}</div>
        </div>
      </div>

      {/* === NEW SECTION TO DISPLAY SAVED TRANSCRIPTS === */}
      <div className="saved-transcripts">
  <h2>Saved Recordings</h2>
  {savedTranscripts.length > 0 ? (
    savedTranscripts.map((item) => (
      <div key={item.id} className="transcript-card">
        <p className="transcript-date">
          Saved on: {new Date(item.created_at).toLocaleString()}
          {editingId === item.id ? (
            <div>
              <button onClick={handleEdit}>Save</button>
              <button onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => {
              setEditingId(item.id);
              setEditContent(item.content);
            }}>Edit</button>
          )}
        </p>
        {editingId === item.id ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={5}
            style={{ width: '100%' }}
          />
        ) : (
          <p className="transcript-content">{item.content}</p>
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