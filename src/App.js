// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';

// This component is stateful to handle real-time edits and merges
// the display logic with interactive editing capabilities.
const FormattedTranscript = ({ initialContent, onSave, onCancel, transcriptId }) => {
  const [content, setContent] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // This effect resets the component's state whenever the initial content changes.
    // This is crucial for when the user cancels an edit or selects a different transcript.
    try {
      const mainData = JSON.parse(initialContent);
      // The medical_data field might be a stringified JSON within the main JSON.
      // This cleans it up and parses it.
      const medicalDataStr = mainData.medical_data.replace(/```json\n?|\n?```/g, '').trim();
      const medicalData = JSON.parse(medicalDataStr);

      setContent({
        verbatim_transcription: mainData.verbatim_transcription,
        ...medicalData
      });
    } catch (error) {
      console.error("Error parsing initial content:", error);
      setContent(null); // Set to null on error to show a fallback message.
    }
  }, [initialContent]);

  // Handler to remove a specific medical term from the state.
  const handleRemoveTerm = (category, index) => {
    const updatedTerms = { ...content.extracted_terms };
    updatedTerms[category].splice(index, 1);
    setContent(prev => ({ ...prev, extracted_terms: updatedTerms }));
  };

  // Handler to save the edited content by calling the parent's onSave function.
  const handleSaveChanges = () => {
    // Reconstruct the JSON object in the exact format the backend expects.
    const finalJSON = JSON.stringify({
      verbatim_transcription: content.verbatim_transcription,
      medical_data: JSON.stringify({
        final_english_text: content.final_english_text,
        extracted_terms: content.extracted_terms,
        summary: content.summary
      })
    }, null, 2); // Pretty print JSON for readability if needed.

    onSave(transcriptId, finalJSON);
    setIsEditing(false);
  };

  // Function to render term pills with a delete button when in edit mode.
  const renderTermPills = (category, terms) => {
    if (!terms || terms.length === 0) {
      return <p className="no-data">N/A</p>;
    }
    return (
      <div className="terms-container">
        {terms.map((term, index) => (
          <span key={index} className="term-pill">
            {term}
            {isEditing && (
              <button className="remove-term-btn" onClick={() => handleRemoveTerm(category, index)}>×</button>
            )}
          </span>
        ))}
      </div>
    );
  };

  // Fallback UI if the JSON content is invalid.
  if (!content) {
    return (
       <div className="formatted-transcript">
         <div className="transcript-section">
           <h3>Raw Transcript</h3>
           <p className="transcript-content">{initialContent}</p>
         </div>
         <div className="error-message">
           Note: Could not parse structured data. Displaying raw content.
         </div>
       </div>
    );
  }

  // Main render logic for the component.
  return (
    <div className="formatted-transcript">
      {!isEditing ? (
        <>
          <div className="transcript-section">
            <h3>Original Conversation</h3>
            <p className="conversation-text">{content.verbatim_transcription}</p>
          </div>
          <div className="transcript-section">
            <h3>English Summary</h3>
            <p className="conversation-text">{content.final_english_text}</p>
          </div>
          <div className="transcript-section">
            <h3>Clinical Summary</h3>
            <p><strong>Medications:</strong> {content.summary?.medications_discussed || 'N/A'}</p>
            <p><strong>Instructions:</strong> {content.summary?.important_instructions || 'N/A'}</p>
            <p><strong>Follow-up:</strong> {content.summary?.follow_up_actions || 'N/A'}</p>
          </div>
          <div className="transcript-section">
            <h3>Extracted Medical Terms</h3>
            {Object.entries(content.extracted_terms || {}).map(([category, terms]) => (
              (terms && terms.length > 0) && (
                <div key={category} className="term-category">
                  <h4>{category.replace(/_/g, ' ')}</h4>
                  {renderTermPills(category, terms)}
                </div>
              )
            ))}
          </div>
          <button onClick={() => setIsEditing(true)}>Edit Terms</button>
        </>
      ) : (
        <div className="edit-view">
          <h3>Editing Medical Terms</h3>
          {Object.entries(content.extracted_terms || {}).map(([category, terms]) => (
            <div key={category} className="term-category">
              <h4>{category.replace(/_/g, ' ')}</h4>
              {renderTermPills(category, terms)}
            </div>
          ))}
          <div className="edit-actions">
            <button onClick={handleSaveChanges}>Save Changes</button>
            <button onClick={() => { setIsEditing(false); onCancel(); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};


function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click 'Start Recording' to begin.");
  const [savedTranscripts, setSavedTranscripts] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [processingState, setProcessingState] = useState('idle');
  const [localAudio, setLocalAudio] = useState({});
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  const mediaRecorder = useRef(null);
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

      const audioData = JSON.parse(localStorage.getItem('audioHistory') || '{}');
      setLocalAudio(audioData);

    } catch (error) {
      console.error("Failed to fetch transcripts:", error);
    }
  }, []);

  useEffect(() => {
    fetchTranscripts();
    return () => {
      clearInterval(pollingInterval.current);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      if (audioContext.current) audioContext.current.close();
    };
  }, [fetchTranscripts]);
  
  const pollForTranscript = useCallback((taskId) => {
    setProcessingState('transcribing');
    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/transcription-status/${taskId}`);
        const data = await response.json();

        if (data.status === "complete") {
          clearInterval(pollingInterval.current);
          setProcessingState('complete');
          setStatusMessage("Transcription complete!");
          
          // The backend now saves the transcript. We just need to refresh our list.
          // We also need to associate the saved audio with the new transcript ID.
          const resultData = JSON.parse(data.result);
          const newTranscriptResponse = await fetch("http://localhost:8000/api/transcripts");
          const allTranscripts = await newTranscriptResponse.json();
          const newTranscript = allTranscripts[0]; // The newest one is at the top
          
          const audioHistory = JSON.parse(localStorage.getItem('audioHistory') || '{}');
          const tempAudio = audioHistory[sessionId.current];
          if (tempAudio && newTranscript) {
             audioHistory[newTranscript.id] = tempAudio;
             delete audioHistory[sessionId.current]; // Clean up temporary key
             localStorage.setItem('audioHistory', JSON.stringify(audioHistory));
          }

          fetchTranscripts(); 
          setTimeout(() => {
            setProcessingState('idle');
            setStatusMessage("Ready for next recording.");
          }, 2000);

        } else if (data.status === "failed") {
            clearInterval(pollingInterval.current);
            setProcessingState('error');
            setStatusMessage(`Error: Transcription failed. ${data.error}`);
            setTimeout(() => setProcessingState('idle'), 3000);
        } else {
            setStatusMessage("Processing in background... This may take several minutes.");
        }
      } catch (error) {
        clearInterval(pollingInterval.current);
        setProcessingState('error');
        setStatusMessage("Error: Could not get transcription status.");
        setTimeout(() => setProcessingState('idle'), 3000);
      }
    }, 5000);
  }, [fetchTranscripts]);
  
  const monitorAudioLevel = useCallback(() => {
    if (!analyser.current || !dataArray.current) return;
    analyser.current.getByteFrequencyData(dataArray.current);
    let sum = 0;
    for (let i = 0; i < dataArray.current.length; i++) {
      sum += dataArray.current[i];
    }
    const average = sum / dataArray.current.length;
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

  const startRecording = useCallback(async () => {
    setStatusMessage("Initializing...");
    sessionId.current = uuidv4();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        if (audioContext.current) audioContext.current.close();
        
        setStatusMessage("Uploading audio file...");
        const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const audioHistory = JSON.parse(localStorage.getItem('audioHistory') || '{}');
          audioHistory[sessionId.current] = base64Audio;
          localStorage.setItem('audioHistory', JSON.stringify(audioHistory));
        };

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
          const { task_id } = await finalizeResponse.json();
          pollForTranscript(task_id);
        } catch (error) {
          console.error("Error during upload/finalization:", error);
          setProcessingState('error');
          setStatusMessage(`Error: ${error.message}`);
          setTimeout(() => setProcessingState('idle'), 3000);
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
  
  const handleUpdate = useCallback(async (transcriptId, updatedContent) => {
    try {
      const response = await fetch(`http://localhost:8000/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent }),
      });
      if (response.ok) {
        fetchTranscripts();
      } else {
        alert("Failed to update: The server rejected the changes.");
      }
    } catch (error) {
      alert("An error occurred while saving.");
    }
  }, [fetchTranscripts]);
  
  const toggleHistoryItem = (id) => {
    setActiveHistoryId(prevId => (prevId === id ? null : id));
  };
  
  const AudioLevelBars = () => ( 
    <div className="audio-level-container">
      <div className="audio-bar" style={{ height: `${4 + audioLevel * 36}px` }}></div>
      <div className="audio-bar" style={{ height: `${4 + audioLevel * 26}px` }}></div>
      <div className="audio-bar" style={{ height: `${4 + audioLevel * 36}px` }}></div>
      <div className="audio-bar" style={{ height: `${4 + audioLevel * 21}px` }}></div>
      <div className="audio-bar" style={{ height: `${4 + audioLevel * 11}px` }}></div>
    </div>
  );
  
  const LoadingDots = () => ( 
    <div className="loading-dots">
      <div className="loading-dot"></div>
      <div className="loading-dot"></div>
      <div className="loading-dot"></div>
    </div>
  );
  
  const ProcessingWave = () => (
    <div className="processing-wave">
      {[...Array(10)].map((_, i) => <div key={i} className="wave-bar"></div>)}
    </div>
  );
  
  const ProgressBar = () => (
    <div className="progress-container">
      <div className="progress-bar"></div>
    </div>
  );

  const renderStatusAnimation = () => {
    switch (processingState) {
      case 'uploading': return (<><ProcessingWave /><ProgressBar /></>);
      case 'transcribing': return <><LoadingDots /><span>Transcribing</span></>;
      case 'complete': return <span className="success-animation">✓</span>;
      case 'error': return <span className="error-animation">✗</span>;
      default: return null;
    }
  };

  return (
    <div className="App">
      <div className="main-recorder">
        <h1>Voice Transcriber</h1>
        <div className="buttons-container">
          {!isRecording ? (
            <button onClick={startRecording} disabled={processingState !== 'idle'}>
              Start Recording
            </button>
          ) : (
            <button onClick={stopRecording} className="recording">
              Stop Recording
            </button>
          )}
        </div>
        {isRecording && <AudioLevelBars />}
        <div className={`transcript-container status-container ${processingState !== 'idle' ? 'processing' : ''}`}>
          <h2>Status:</h2>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{statusMessage}</p>
            {renderStatusAnimation()}
          </div>
        </div>
      </div>
      
      <div className="saved-transcripts">
        <h2>Saved Recordings</h2>
        {savedTranscripts.length > 0 ? (
          savedTranscripts.map((item) => (
            <div key={item.id} className="transcript-card">
              <div className="history-summary" onClick={() => toggleHistoryItem(item.id)}>
                 <p className="transcript-date">
                   Saved on: {new Date(item.created_at).toLocaleString()}
                 </p>
                 <span>{activeHistoryId === item.id ? '▲' : '▼'}</span>
              </div>
              
              {activeHistoryId === item.id && (
                <div className="history-details">
                  {localAudio[item.id] && (
                    <div className="audio-player-container">
                      <h4>Recorded Audio</h4>
                      <audio controls src={localAudio[item.id]} />
                    </div>
                  )}

                  <FormattedTranscript
                    transcriptId={item.id}
                    initialContent={item.content}
                    onSave={handleUpdate}
                    onCancel={fetchTranscripts}
                  />
                </div>
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
