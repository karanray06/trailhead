import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Activity, Compass, Sun, Cloud, Thermometer, Volume2, TreePine, Navigation } from 'lucide-react';
import './index.css';

// Type definitions based on what the API will return
interface BriefResponse {
  activity: string;
  reasoning: string;
  weather: {
    temp_max: number;
    temp_min: number;
    precip: number;
  };
  route?: {
    distance: string;
    description: string;
  };
}

export default function App() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [location, setLocation] = useState('');
  const [interest, setInterest] = useState('');
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Auto-detect location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`);
        },
        (err) => console.warn('Geolocation blocked or failed', err)
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return;
    setStep(1);
    setError(null);

    try {
      const response = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, interests: [interest || 'outdoors'] })
      });
      
      if (!response.ok) throw new Error('Failed to generate brief');
      
      const data = await response.json();
      // Assume the data matches our interface or adapt it
      setBrief(data);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
      setStep(0);
    }
  };

  const handleSpeak = () => {
    if (!brief) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    
    const text = `Today's best outdoor activity is ${brief.activity}. ${brief.reasoning}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <div className="app-container">
      {/* Background elements for rich aesthetics */}
      <div className="bg-blob blob-1"></div>
      <div className="bg-blob blob-2"></div>
      
      <main className="main-content">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="glass-card"
            >
              <div className="card-header">
                <div className="logo-icon">
                  <TreePine size={32} />
                </div>
                <h1>Trailhead</h1>
                <p>Your one-card outdoor companion. Get offline.</p>
              </div>

              <form onSubmit={handleSubmit} className="setup-form">
                <div className="input-group">
                  <label><MapPin size={16} /> Location</label>
                  <input 
                    type="text" 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Auto-detecting..."
                    required
                  />
                </div>
                
                <div className="input-group">
                  <label><Activity size={16} /> What are you into?</label>
                  <input 
                    type="text" 
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    placeholder="e.g. Hiking, Birding, Running"
                  />
                </div>
                
                {error && <div className="error-message">{error}</div>}

                <button type="submit" className="primary-btn">
                  <Compass size={18} /> Find Today's Outing
                </button>
              </form>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card loading-card"
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="loading-icon"
              >
                <Compass size={48} />
              </motion.div>
              <h2>Consulting the trails...</h2>
              <p>Analyzing local weather patterns and routing data.</p>
            </motion.div>
          )}

          {step === 2 && brief && (
            <motion.div 
              key="brief"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card brief-card"
            >
              <div className="weather-strip">
                <div className="weather-item"><Thermometer size={16} /> {brief.weather?.temp_max}°C</div>
                <div className="weather-item"><Cloud size={16} /> {brief.weather?.precip}mm</div>
                <div className="weather-item"><Sun size={16} /> Clear</div>
              </div>

              <div className="brief-content">
                <h2>{brief.activity}</h2>
                <p className="reasoning">{brief.reasoning}</p>
                
                {brief.route && (
                  <div className="route-info">
                    <Navigation size={18} />
                    <span>{brief.route.distance} - {brief.route.description}</span>
                  </div>
                )}
              </div>

              <div className="card-actions">
                <button 
                  onClick={handleSpeak} 
                  className={`action-btn ${isSpeaking ? 'active' : ''}`}
                  aria-label="Read Aloud"
                >
                  <Volume2 size={24} />
                  <span>{isSpeaking ? 'Playing...' : 'Read Aloud'}</span>
                </button>
                <button onClick={() => setStep(0)} className="secondary-btn">
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
