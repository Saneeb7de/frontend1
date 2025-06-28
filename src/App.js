// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';

// Backend URL - Change this to your deployed backend
const BACKEND_URL = "https://backend1-410p.onrender.com";

/**
 * A dedicated component for editing the transcript data.
 * It's fully controlled and handles all form state internally.
 */
const TranscriptEditor = ({ initialData, onSave, onCancel }) => {
  const [editableData, setEditableData] = useState(initialData);
  const [newTerms, setNewTerms] = useState({}); // To hold new term input values for each category

  // Generic handler for textareas and text inputs
  const handleTextChange = (e) => {
    const { name, value } = e.target;
    setEditableData(prev => ({ ...prev, [name]: value }));
  };

  // Handler for nested summary object
  const handleSummaryChange = (e) => {
    const { name, value } = e.target;
    setEditableData(prev => ({
      ...prev,
      summary: { ...prev.summary, [name]: value }
    }));
  };

  // Handler for the new term input fields
  const handleNewTermChange = (category, value) => {
    setNewTerms(prev => ({ ...prev, [category]: value }));
  };

  const handleAddTerm = (category) => {
    const newTerm = newTerms[category]?.trim();
    if (!newTerm) return;
    
    setEditableData(prev => ({
      ...prev,
      extracted_terms: {
        ...prev.extracted_terms,
        [category]: [...(prev.extracted_terms[category] || []), newTerm]
      }
    }));
    setNewTerms(prev => ({ ...prev, [category]: '' })); // Clear input
  };

  const handleRemoveTerm = (category, index) => {
    setEditableData(prev => {
      const updatedTerms = [...prev.extracted_terms[category]];
      updatedTerms.splice(index, 1);
      return {
        ...prev,
        extracted_terms: {
          ...prev.extracted_terms,
          [category]: updatedTerms
        }
      };
    });
  };

  const handleSaveChanges = () => {
    // Reconstruct the JSON object in the exact format the backend expects.
    const finalJSON = JSON.stringify({
      verbatim_transcription: editableData.verbatim_transcription,
      medical_data: JSON.stringify({
        final_english_text: editableData.final_english_text,
        extracted_terms: editableData.extracted_terms,
        summary: editableData.summary
      })
    }, null, 2);

    onSave(finalJSON);
  };

  return (
    <div className="edit-view">
      <h3>Editing Transcript</h3>
      
      <div className="edit-section">
        <h4>Original Conversation</h4>
        <textarea
          name="verbatim_transcription"
          value={editableData.verbatim_transcription}
          onChange={handleTextChange}
          className="edit-textarea"
          rows={6}
        />
      </div>

      <div className="edit-section">
        <h4>English Summary</h4>
        <textarea
          name="final_english_text"
          value={editableData.final_english_text}
          onChange={handleTextChange}
          className="edit-textarea"
          rows={4}
        />
      </div>

      <div className="edit-section clinical-summary-edit">
        <h4>Clinical Summary</h4>
        <div>
          <label>Medications Discussed</label>
          <input
            type="text"
            name="medications_discussed"
            value={editableData.summary?.medications_discussed || ''}
            onChange={handleSummaryChange}
            className="edit-input"
          />
        </div>
        <div>
          <label>Important Instructions</label>
          <input
            type="text"
            name="important_instructions"
            value={editableData.summary?.important_instructions || ''}
            onChange={handleSummaryChange}
            className="edit-input"
          />
        </div>
        <div>
          <label>Follow-up Actions</label>
          <input
            type="text"
            name="follow_up_actions"
            value={editableData.summary?.follow_up_actions || ''}
            onChange={handleSummaryChange}
            className="edit-input"
          />
        </div>
      </div>

      <div className="edit-section">
        <h4>Extracted Medical Terms</h4>
        {Object.entries(editableData.extracted_terms || {}).map(([category, terms]) => (
          <div key={category} className="term-category-edit">
            <div className="category-header">
              <h4>{category.replace(/_/g, ' ')}</h4>
            </div>
            <div className="terms-container">
              {terms.map((term, index) => (
                <span key={index} className="term-pill">
                  {term}
                  <button className="remove-term-btn" onClick={() => handleRemoveTerm(category, index)}>×</button>
                </span>
              ))}
            </div>
            <div className="add-term">
              <input
                type="text"
                className="category-input"
                placeholder={`Add a new ${category.replace(/_/g, ' ')}...`}
                value={newTerms[category] || ''}
                onChange={(e) => handleNewTermChange(category, e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTerm(category)}
              />
              <button onClick={() => handleAddTerm(category)}>Add Term</button>
            </div>
          </div>
        ))}
      </div>

      <div className="edit-actions">
        <button className="save-btn" onClick={handleSaveChanges}>Save Changes</button>
        <button className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};


/**
 * This component acts as a controller, parsing the transcript content
 * and deciding whether to show the display view or the editor view.
 */
const FormattedTranscript = ({ initialContent, onSave, transcriptId }) => {
  const [isEditing, setIsEditing] = useState(false);

  // useMemo is perfect here. It parses the complex JSON string only when initialContent changes.
  const parsedContent = useMemo(() => {
    try {
      const mainData = JSON.parse(initialContent);
      const medicalDataStr = mainData.medical_data.replace(/```json\n?|\n?```/g, '').trim();
      const medicalData = JSON.parse(medicalDataStr);
      return {
        verbatim_transcription: mainData.verbatim_transcription,
        ...medicalData
      };
    } catch (error) {
      console.error("Error parsing initial content:", error);
      return null; // Return null on error to render a fallback.
    }
  }, [initialContent]);

  // Wrapper for the save function to also exit editing mode
  const handleSave = (updatedContent) => {
    onSave(transcriptId, updatedContent);
    setIsEditing(false);
  };

  // Fallback UI if the JSON content is invalid.
  if (!parsedContent) {
    return (
       <div className="formatted-transcript">
         <h3>Raw Transcript</h3>
         <p className="conversation-text">{initialContent}</p>
         <div className="error-message">
           Note: Could not parse structured data. Displaying raw content.
         </div>
       </div>
    );
  }
  
  // Render the editor if in editing mode
  if (isEditing) {
    return (
      <TranscriptEditor 
        initialData={parsedContent}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)} // Simply exit editing mode, no refetch needed.
      />
    );
  }

  // Default: Render the display view
  return (
    <div className="formatted-transcript">
      <div className="transcript-section">
        <h3>Original Conversation</h3>
        <p className="conversation-text">{parsedContent.verbatim_transcription}</p>
      </div>
      <div className="transcript-section">
        <h3>English Summary</h3>
        <p className="conversation-text">{parsedContent.final_english_text}</p>
      </div>
      <div className="transcript-section">
        <h3>Clinical Summary</h3>
        <div className="summary-item">
          <p><strong>Medications:</strong> {parsedContent.summary?.medications_discussed || 'N/A'}</p>
          <p><strong>Instructions:</strong> {parsedContent.summary?.important_instructions || 'N/A'}</p>
          <p><strong>Follow-up:</strong> {parsedContent.summary?.follow_up_actions || 'N/A'}</p>
        </div>
      </div>
      <div className="transcript-section">
        <h3>Extracted Medical Terms</h3>
        {Object.entries(parsedContent.extracted_terms || {}).map(([category, terms]) => (
          (terms && terms.length > 0) && (
            <div key={category} className="term-category">
              <h4>{category.replace(/_/g, ' ')}</h4>
              <div className="terms-container">
                {terms.map((term, index) => (
                  <span key={index} className="term-pill">{term}</span>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
      <button onClick={() => setIsEditing(true)}>Edit Transcript</button>
    </div>
  );
};


function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click 'Start Recording' to begin.");
  const [savedTranscripts, setSavedTranscripts] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [processingState, setProcessingState] = useState('idle');
  const [audioStorage, setAudioStorage] = useState({});
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
      const response = await fetch(`${BACKEND_URL}/api/transcripts`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setSavedTranscripts(data);
    } catch (error) {
      console.error("Failed to fetch transcripts:", error);
    }
  }, []);

  useEffect(() => {
    fetchTranscripts();
    return () => {
      clearInterval(pollingInterval.current);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      if (audioContext.current?.state !== 'closed') audioContext.current?.close();
    };
  }, [fetchTranscripts]);
  
  const pollForTranscript = useCallback((taskId) => {
    setProcessingState('transcribing');
    pollingInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/transcription-status/${taskId}`);
        const data = await response.json();

        if (data.status === "complete") {
          clearInterval(pollingInterval.current);
          setProcessingState('complete');
          setStatusMessage("Transcription complete!");
          
          const newTranscriptResponse = await fetch(`${BACKEND_URL}/api/transcripts`);
          const allTranscripts = await newTranscriptResponse.json();
          const newTranscript = allTranscripts[0];
          
          if (audioStorage[sessionId.current] && newTranscript) {
             setAudioStorage(prev => {
               const updated = { ...prev };
               updated[newTranscript.id] = updated[sessionId.current];
               delete updated[sessionId.current];
               return updated;
             });
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
  }, [fetchTranscripts, audioStorage]);
  
  const monitorAudioLevel = useCallback(() => {
    if (!analyser.current || !dataArray.current || !isRecording) return;
    analyser.current.getByteFrequencyData(dataArray.current);
    let sum = 0;
    for (let i = 0; i < dataArray.current.length; i++) {
      sum += dataArray.current[i];
    }
    const average = sum / dataArray.current.length;
    const normalizedLevel = Math.min(average / 128, 1);
    setAudioLevel(prevLevel => prevLevel * 0.8 + normalizedLevel * 0.2);
    animationFrame.current = requestAnimationFrame(monitorAudioLevel);
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
        if (audioContext.current?.state !== 'closed') audioContext.current?.close();
        
        setStatusMessage("Uploading audio file...");
        const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          setAudioStorage(prev => ({ ...prev, [sessionId.current]: base64Audio }));
        };

        const formData = new FormData();
        formData.append("session_id", sessionId.current);
        formData.append("chunk_index", 0);
        formData.append("audio_chunk", audioBlob, `chunk_0.webm`);
        try {
          await fetch(`${BACKEND_URL}/api/upload-chunk`, { method: 'POST', body: formData });
          const finalizeResponse = await fetch(`${BACKEND_URL}/api/finalize-recording`, {
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
      const response = await fetch(`${BACKEND_URL}/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent }),
      });
      if (response.ok) {
        fetchTranscripts(); // Refresh the data from the server after a successful save
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
      {[...Array(5)].map((_, i) => <div key={i} className="audio-bar" style={{ height: `${4 + audioLevel * (36 - i*5)}px` }}></div>)}
    </div>
  );
  
  const LoadingDots = () => ( <div className="loading-dots"><div className="loading-dot"></div><div className="loading-dot"></div><div className="loading-dot"></div></div> );
  const ProcessingWave = () => ( <div className="processing-wave">{[...Array(10)].map((_, i) => <div key={i} className="wave-bar"></div>)}</div> );
  const ProgressBar = () => ( <div className="progress-container"><div className="progress-bar"></div></div> );

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
                  {audioStorage[item.id] && (
                    <div className="audio-player-container">
                      <h4>Recorded Audio</h4>
                      <audio controls src={audioStorage[item.id]} />
                    </div>
                  )}
                  <FormattedTranscript
                    transcriptId={item.id}
                    initialContent={item.content}
                    onSave={handleUpdate}
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