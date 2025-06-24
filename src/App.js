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
  const [audioLevel, setAudioLevel] = useState(0);
  const [processingState, setProcessingState] = useState('idle'); // idle, uploading, transcribing, complete, error

  const mediaRecorder = useRef(null);
  const uploadInterval = useRef(null);
  const pollingInterval = useRef(null);
  const sessionId = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);
  const dataArray = useRef(null);
  const animationFrame = useRef(null);

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearInterval(uploadInterval.current);
      clearInterval(pollingInterval.current);
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, [fetchTranscripts]);

  const pollForTranscript = useCallback((taskId) => {
    setProcessingState('transcribing');
    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/transcription-status/${taskId}`);
        if (!response.ok) {
          throw new Error("Polling request failed");
        }
        const data = await response.json();

        if (data.status === "complete") {
          clearInterval(pollingInterval.current);
          setProcessingState('complete');
          setStatusMessage("Transcription complete! Refreshing list...");
          fetchTranscripts(); // The result is already in the DB, just refresh the list
          
          // Reset to idle after showing success for 2 seconds
          setTimeout(() => {
            setProcessingState('idle');
            setStatusMessage("Ready for next recording.");
          }, 2000);
        } else if (data.status === "failed") {
          clearInterval(pollingInterval.current);
          setProcessingState('error');
          setStatusMessage(`Error: Transcription failed. ${data.error}`);
          
          // Reset to idle after showing error for 3 seconds
          setTimeout(() => {
            setProcessingState('idle');
            setStatusMessage("Ready to try again.");
          }, 3000);
        } else {
          // Still pending, just update the status message
          setStatusMessage("Processing in background... This may take several minutes for long recordings.");
        }
      } catch (error) {
        console.error("Polling error:", error);
        clearInterval(pollingInterval.current);
        setProcessingState('error');
        setStatusMessage("Error: Could not get transcription status.");
        
        // Reset to idle after showing error for 3 seconds
        setTimeout(() => {
          setProcessingState('idle');
          setStatusMessage("Ready to try again.");
        }, 3000);
      }
    }, 5000); // Poll every 5 seconds
  }, [fetchTranscripts]);

  // Audio level monitoring
  const monitorAudioLevel = useCallback(() => {
    if (!analyser.current || !dataArray.current) return;

    analyser.current.getByteFrequencyData(dataArray.current);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.current.length; i++) {
      sum += dataArray.current[i];
    }
    const average = sum / dataArray.current.length;
    
    // Normalize to 0-1 range and apply some smoothing
    const normalizedLevel = Math.min(average / 128, 1);
    setAudioLevel(prevLevel => prevLevel * 0.8 + normalizedLevel * 0.2);

    if (isRecording) {
      animationFrame.current = requestAnimationFrame(monitorAudioLevel);
    }
  }, [isRecording]);

  const setupAudioAnalysis = useCallback(async (stream) => {
    try {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      analyser.current = audioContext.current.createAnalyser();
      const source = audioContext.current.createMediaStreamSource(stream);
      
      analyser.current.fftSize = 256;
      const bufferLength = analyser.current.frequencyBinCount;
      dataArray.current = new Uint8Array(bufferLength);
      
      source.connect(analyser.current);
      monitorAudioLevel();
    } catch (error) {
      console.error("Error setting up audio analysis:", error);
    }
  }, [monitorAudioLevel]);

  // eslint-disable-next-line no-unused-vars
  const uploadChunk = useCallback(async (blob) => {
    if (!blob) return;
    const formData = new FormData();
    formData.append("session_id", sessionId.current);
    formData.append("chunk_index", 0);
    formData.append("audio_chunk", blob, `recording.webm`);
  }, []);

  const startRecording = useCallback(async () => {
    setStatusMessage("Initializing...");
    sessionId.current = uuidv4();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup audio analysis for visual feedback
      setupAudioAnalysis(stream);
      
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
        setIsRecording(false);
        setAudioLevel(0);
        setProcessingState('uploading');
        
        if (animationFrame.current) {
          cancelAnimationFrame(animationFrame.current);
        }
        if (audioContext.current) {
          audioContext.current.close();
        }

        setStatusMessage("Uploading audio file... Please wait.");
        const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });

        const formData = new FormData();
        formData.append("session_id", sessionId.current);
        formData.append("chunk_index", 0);
        formData.append("audio_chunk", audioBlob, `chunk_0.webm`);
        
        try {
          await fetch("http://localhost:8000/api/upload-chunk", { method: 'POST', body: formData });
          
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
          
          pollForTranscript(task_id);

        } catch (error) {
          console.error("Error during upload/finalization:", error);
          setProcessingState('error');
          setStatusMessage(`Error: ${error.message}`);
          
          // Reset to idle after showing error for 3 seconds
          setTimeout(() => {
            setProcessingState('idle');
            setStatusMessage("Ready to try again.");
          }, 3000);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatusMessage("Could not start recording. Please allow microphone access.");
    }
  }, [pollForTranscript, setupAudioAnalysis]);

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

  // Component for audio level bars
  const AudioLevelBars = () => (
    <div className="audio-level-container">
      <div className="audio-bar audio-bar-1" style={{ height: `${4 + audioLevel * 36}px` }}></div>
      <div className="audio-bar audio-bar-2" style={{ height: `${4 + audioLevel * 26}px` }}></div>
      <div className="audio-bar audio-bar-3" style={{ height: `${4 + audioLevel * 36}px` }}></div>
      <div className="audio-bar audio-bar-4" style={{ height: `${4 + audioLevel * 21}px` }}></div>
      <div className="audio-bar audio-bar-5" style={{ height: `${4 + audioLevel * 11}px` }}></div>
    </div>
  );

  // Component for loading dots animation
  const LoadingDots = () => (
    <div className="loading-dots">
      <div className="loading-dot"></div>
      <div className="loading-dot"></div>
      <div className="loading-dot"></div>
    </div>
  );

  // Component for transcription animation
  const TranscriptionAnimation = () => (
    <div className="transcription-animation">
      <div className="transcription-icon"></div>
      <span>Transcribing</span>
      <LoadingDots />
    </div>
  );

  // Component for processing wave animation
  const ProcessingWave = () => (
    <div className="processing-wave">
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
    </div>
  );

  // Component for progress bar animation
  const ProgressBar = () => (
    <div className="progress-container">
      <div className="progress-bar"></div>
    </div>
  );

  // Function to render status animations based on processing state
  const renderStatusAnimation = () => {
    switch (processingState) {
      case 'uploading':
        return (
          <>
            <ProcessingWave />
            <ProgressBar />
          </>
        );
      case 'transcribing':
        return <TranscriptionAnimation />;
      case 'complete':
        return <span className="success-animation">✓</span>;
      case 'error':
        return <span className="error-animation">✗</span>;
      default:
        return null;
    }
  };

  return (
    <div className="App">
      <div className="main-recorder">
        <h1>Voice Transcriber</h1>
        
        <div className="buttons-container">
          {!isRecording ? (
            <button onClick={startRecording}>Start Recording</button>
          ) : (
            <button onClick={stopRecording} className="recording">Stop Recording</button>
          )}
        </div>

        {isRecording && <AudioLevelBars />}
        
        <div className={`transcript-container status-container ${processingState !== 'idle' ? 'processing' : ''}`}>
          <h2>Status:</h2>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0, flex: 1 }}>{statusMessage}</p>
            {renderStatusAnimation()}
          </div>
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