import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';
// import Recorder from 'recorder-js';

// Backend URL - Change this to your deployed backend
const BACKEND_URL = "https://backend1-1-mr5r.onrender.com";
// const BACKEND_URL = "http://localhost:8000"; // Local development URL

// ... TranscriptEditor and FormattedTranscript components remain the same ...
// (No changes needed in these components, so they are omitted for brevity)
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

const FormattedTranscript = ({ initialContent, onSave, transcriptId }) => {
  const [isEditing, setIsEditing] = useState(false);

  // useMemo is perfect here. It parses the complex JSON string only when initialContent changes.
  const parsedContent = useMemo(() => {
    try {
      const mainData = JSON.parse(initialContent);

      // Handle both possible medical_data formats (string or object)
      let medicalData;
      if (typeof mainData.medical_data === 'string') {
        const medicalDataStr = mainData.medical_data.replace(/```json\n?|\n?```/g, '').trim();
        medicalData = JSON.parse(medicalDataStr);
      } else {
        medicalData = mainData.medical_data;
      }

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
  const [serverStatus, setServerStatus] = useState({ activeTasks: 0, maxTasks: 2 });
  
  // REFINED: States for handling live transcription properly
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');


  const mediaRecorder = useRef(null);
  const pollingInterval = useRef(null);
  const sessionId = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);
  const dataArray = useRef(null);
  const animationFrame = useRef(null);
  const websocket = useRef(null);

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

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch(BACKEND_URL);
      if (!response.ok) return;
      
      const data = await response.json();
      if (data.concurrent_tasks) {
        const [activeTasks, maxTasks] = data.concurrent_tasks.split('/').map(Number);
        setServerStatus({
          activeTasks: isNaN(activeTasks) ? 0 : activeTasks,
          maxTasks: isNaN(maxTasks) ? 2 : maxTasks
        });
      }
    } catch (error) {
      console.error("Failed to fetch server status:", error);
    }
  }, []);

  useEffect(() => {
    fetchTranscripts();
    fetchServerStatus();
    
    const statusInterval = setInterval(fetchServerStatus, 30000);
    
    return () => {
      clearInterval(pollingInterval.current);
      clearInterval(statusInterval);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      if (audioContext.current?.state !== 'closed') audioContext.current?.close();
      if (websocket.current) {
        websocket.current.close();
      }
    };
  }, [fetchTranscripts, fetchServerStatus]);
  
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
          fetchServerStatus();
          
          if (audioStorage[sessionId.current]) {
            const newTranscriptResponse = await fetch(`${BACKEND_URL}/api/transcripts`);
            const allTranscripts = await newTranscriptResponse.json();
            const newTranscript = allTranscripts[0];
            
            if (newTranscript) {
              setAudioStorage(prev => ({
                ...prev,
                [newTranscript.id]: prev[sessionId.current]
              }));
            }
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
  }, [fetchTranscripts, audioStorage, fetchServerStatus]);
  
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
    if (serverStatus.activeTasks >= serverStatus.maxTasks) {
      setProcessingState('error');
      setStatusMessage("Server is at capacity. Please try again later.");
      setTimeout(() => setProcessingState('idle'), 3000);
      return;
    }
    
    setStatusMessage("Initializing...");
    // REFINED: Reset both transcript states
    setFinalTranscript('');
    setInterimTranscript('');
    sessionId.current = uuidv4();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupAudioAnalysis(stream);
      
      const wssUrl = BACKEND_URL.replace(/^https/, 'wss') + "/wss/live-transcribe";
      websocket.current = new WebSocket(wssUrl);

      websocket.current.onopen = () => {
        console.log("WebSocket connection established for live transcription.");
      };
      
      // REFINED: WebSocket onmessage handler
      websocket.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error("WebSocket Error from server:", data.error);
            setInterimTranscript(`Live transcription error: ${data.error}`);
            return;
          }
          
          if (data.is_final) {
            // Append final result and clear interim
            setFinalTranscript(prev => prev + data.transcript + ' ');
            setInterimTranscript('');
          } else {
            // Update interim result
            setInterimTranscript(data.transcript);
          }
        } catch (e) {
            console.error("Failed to parse WebSocket message:", event.data);
        }
      };

      websocket.current.onerror = (error) => {
        console.error("WebSocket Error:", error);
        setInterimTranscript("Live transcription connection error.");
      };

      websocket.current.onclose = () => {
        console.log("WebSocket connection closed.");
      };

      const recorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      });
      mediaRecorder.current = recorder;
      let localAudioChunks = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          localAudioChunks.push(event.data);
          if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
            websocket.current.send(event.data);
          }
        }
      };
      
      recorder.onstart = () => {
        setIsRecording(true);
        setStatusMessage("Recording... Click 'Stop' to process.");
      };
      
      recorder.onstop = async () => {
        setIsRecording(false);
        setAudioLevel(0);
        
        if (websocket.current?.readyState === WebSocket.OPEN) {
          websocket.current.close();
        }

        setProcessingState('uploading');
        if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        if (audioContext.current?.state !== 'closed') audioContext.current?.close();
        
        setStatusMessage("Uploading final audio...");
        const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          setAudioStorage(prev => ({ ...prev, [sessionId.current]: base64Audio }));
        };

        try {
          const formData = new FormData();
          formData.append("session_id", sessionId.current);
          formData.append("chunk_index", 0);
          formData.append("audio_chunk", audioBlob, `chunk_0.webm`);
          
          await fetch(`${BACKEND_URL}/api/upload-chunk`, { 
            method: 'POST', 
            body: formData 
          });
          
          const finalizeResponse = await fetch(`${BACKEND_URL}/api/finalize-recording`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId.current }),
          });
          
          if (finalizeResponse.status === 429) {
            setProcessingState('error');
            setStatusMessage("Server is busy. Please try again later.");
            return;
          }
          
          const { task_id } = await finalizeResponse.json();
          fetchServerStatus();
          pollForTranscript(task_id);
        } catch (error) {
          console.error("Error during upload/finalization:", error);
          setProcessingState('error');
          setStatusMessage(`Error: ${error.message || "Server communication failed"}`);
          setTimeout(() => setProcessingState('idle'), 3000);
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };
      
      recorder.start(500); // Get chunks every 500ms

    } catch (error) {
      console.error("Error starting recording:", error);
      setProcessingState('error');
      setStatusMessage("Could not start recording. Please allow microphone access.");
      setTimeout(() => setProcessingState('idle'), 1000);
    }
  }, [pollForTranscript, setupAudioAnalysis, serverStatus, fetchServerStatus]);

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
        fetchTranscripts(); // Refresh transcripts after update
      } else if (response.status === 404) {
        alert("Transcript not found. It may have been deleted.");
      } else {
        alert("Failed to update: The server rejected the changes.");
      }
    } catch (error) {
      alert("An error occurred while saving. Please try again.");
    }
  }, [fetchTranscripts]);
  
  const toggleHistoryItem = (id) => {
    setActiveHistoryId(prevId => (prevId === id ? null : id));
  };
  
  const AudioLevelBars = () => ( 
    <div className="audio-level-container">
      {[...Array(5)].map((_, i) => (
        <div 
          key={i} 
          className="audio-bar" 
          style={{ height: `${4 + audioLevel * (36 - i*5)}px` }}
        ></div>
      ))}
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
      {[...Array(10)].map((_, i) => (
        <div key={i} className="wave-bar" style={{ 
          animationDelay: `${i * 0.1}s`,
          height: `${20 + Math.sin(i) * 10}px`
        }}></div>
      ))}
    </div>
  );

  const renderStatusAnimation = () => {
    switch (processingState) {
      case 'uploading': return <ProcessingWave />;
      case 'transcribing': return <LoadingDots />;
      case 'complete': return <span className="success-animation">✓</span>;
      case 'error': return <span className="error-animation">✗</span>;
      default: return null;
    }
  };

  const serverCapacityIndicator = () => {
    const capacityPercent = Math.min(
      (serverStatus.activeTasks / serverStatus.maxTasks) * 100, 
      100
    );
    
    return (
      <div className="server-status">
        <div className="capacity-label">
        </div>
        <div className="capacity-bar">
          <div 
            className="capacity-fill" 
            style={{ width: `${capacityPercent}%` }}
            data-status={
              capacityPercent > 90 ? "high" : 
              capacityPercent > 70 ? "medium" : "low"
            }
          ></div>
        </div>
      </div>
    );
  };
  
  // REFINED: Live transcript display
  const LiveTranscriptDisplay = () => (
    <div className="live-transcript-container">
      <p>
        <span className="final-transcript">{finalTranscript}</span>
        <span className="interim-transcript">{interimTranscript}</span>
        {(!finalTranscript && !interimTranscript) && <span className="listening-placeholder">Listening...</span>}
      </p>
    </div>
  );

  return (
    <div className="App">
      <div className="main-recorder">
        <h1>Voice Transcriber</h1>
        
        {serverCapacityIndicator()}
        
        <div className="buttons-container">
          {!isRecording ? (
            <button 
              onClick={startRecording} 
              disabled={processingState !== 'idle' || serverStatus.activeTasks >= serverStatus.maxTasks}
              className={serverStatus.activeTasks >= serverStatus.maxTasks ? "disabled" : ""}
            >
              {serverStatus.activeTasks >= serverStatus.maxTasks 
                ? "Server Busy" 
                : "Start Recording"}
            </button>
          ) : (
            <button onClick={stopRecording} className="recording">
              Stop Recording
            </button>
          )}
        </div>
        
        {isRecording && <AudioLevelBars />}
        
        {isRecording && <LiveTranscriptDisplay />}

        <div className={`status-container ${processingState !== 'idle' ? 'processing' : ''}`}>
          <h2>Status:</h2>
          <div className="status-content">
            <p className="status-message">{statusMessage}</p>
            <div className="status-animation">
              {renderStatusAnimation()}
            </div>
          </div>
        </div>
      </div>
      
      <div className="saved-transcripts">
        <h2>Saved Recordings</h2>
        
        {savedTranscripts.length === 0 ? (
          <p className="empty-state">No saved transcripts yet. Make a recording to see it here!</p>
        ) : (
          savedTranscripts.map((item) => (
            <div key={item.id} className="transcript-card">
              <div 
                className="history-summary" 
                onClick={() => toggleHistoryItem(item.id)}
              >
                <p className="transcript-date">
                  {new Date(item.created_at).toLocaleString()}
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
        )}
      </div>
    </div>
  );
}

export default App;