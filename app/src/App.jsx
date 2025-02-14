import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const loadFromLocalStorage = () => {
  try {
    const savedState = localStorage.getItem('formState');
    return savedState ? JSON.parse(savedState) : null;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return null;
  }
};

// Helper function to convert UTC ISO string to local datetime-local format
const formatLocalDateTime = (isoString) => {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function App() {
  const [results, setResults] = useState([])
  const [formState, setFormState] = useState(() => {
    const savedState = loadFromLocalStorage();
    return savedState || {
      weight: 70,
      halfLife: 12,
      vd: 0.7,
      bioavailability: 0.8,
      medicationHistory: []
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('formState', JSON.stringify(formState));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [formState]);

  useEffect(() => {
    const calculateConcentrations = async () => {
      if (formState.medicationHistory && formState.medicationHistory.length > 0) {
        try {
          const requestData = {
            ...formState,
            weight: parseFloat(formState.weight),
            vd: parseFloat(formState.vd),
            medicationHistory: formState.medicationHistory.map(med => ({
              timestamp: med.timestamp,
              dosage: convertToMg(parseFloat(med.dosage), med.unit),
              taken: true
            }))
          };

          const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
          });

          const responseText = await response.text();
          const data = JSON.parse(responseText);

          if (!response.ok) {
            throw new Error(data.error || 'Calculation failed');
          }

          setResults(data);
        } catch (error) {
          console.error('Error calculating concentrations:', error);
        }
      } else {
        // Clear results if there are no doses
        setResults([]);
      }
    };

    calculateConcentrations();
  }, [formState]); // Now depends on formState changes

  const convertToMg = (value, unit) => {
    switch (unit) {
      case 'ug': return value / 1000;
      case 'g': return value * 1000;
      default: return value;
    }
  };

  const addDose = () => {
    const now = new Date();
    const localISOTime = now.toISOString();  // Use UTC ISO string directly

    const newDose = {
      timestamp: localISOTime,
      dosage: "500",
      unit: "mg",
      taken: true
    };
    console.log("Adding new dose:", newDose);
    setFormState(prev => ({
      ...prev,
      medicationHistory: [...prev.medicationHistory, newDose]
    }));
  }

  const deleteDose = (index) => {
    setFormState(prev => ({
      ...prev,
      medicationHistory: prev.medicationHistory.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="app-container">
      <h1>ASM Concentration Calculator</h1>

      <form className="calculator-grid">
        <div className="parameters-grid">
          <div className="form-section">
            <h2>Patient Parameters</h2>
            <label>
              Weight (kg):
              <input
                type="number"
                value={formState.weight}
                onChange={e => setFormState({ ...formState, weight: e.target.value })}
                step="0.1"
                required
              />
            </label>

            <label>
              Half-life (hours):
              <input
                type="number"
                value={formState.halfLife}
                onChange={e => setFormState({ ...formState, halfLife: e.target.value })}
                required
              />
            </label>
          </div>

          <div className="form-section">
            <h2>Drug Parameters</h2>
            <label>
              Volume of Distribution (L/kg):
              <input
                type="number"
                value={formState.vd}
                onChange={e => setFormState({ ...formState, vd: e.target.value })}
                step="0.1"
                required
              />
            </label>

            <label>
              Bioavailability (%):
              <input
                type="number"
                value={formState.bioavailability * 100}
                onChange={e => setFormState({ ...formState, bioavailability: e.target.value / 100 })}
                min="0"
                max="100"
                required
              />
            </label>
          </div>

          <div className="form-section medication-history">
            <h2>Medication History</h2>
            <div className="button-row">
              <button type="button" onClick={addDose} className="add-dose-btn">
                Add New Dose
              </button>
            </div>

            {formState.medicationHistory.map((med, index) => (
              <div key={index} className="dose-entry">
                <div className="dose-entry-inputs">
                  <input
                    type="datetime-local"
                    value={formatLocalDateTime(med.timestamp)}
                    onChange={e => {
                      const newHistory = [...formState.medicationHistory];
                      const date = new Date(e.target.value);
                      newHistory[index].timestamp = date.toISOString();  // Store as UTC ISO string
                      setFormState({ ...formState, medicationHistory: newHistory });
                    }}
                    required
                  />
                  <div className="dose-value-group">
                    <input
                      type="number"
                      value={med.dosage}
                      onChange={e => {
                        const newHistory = [...formState.medicationHistory];
                        newHistory[index].dosage = e.target.value;
                        setFormState({ ...formState, medicationHistory: newHistory });
                      }}
                      placeholder="Dosage"
                      min="0"
                      step="any"
                      required
                    />
                    <select
                      value={med.unit || 'mg'}
                      onChange={e => {
                        const newHistory = [...formState.medicationHistory];
                        newHistory[index].unit = e.target.value;
                        setFormState({ ...formState, medicationHistory: newHistory });
                      }}
                    >
                      <option value="ug">µg</option>
                      <option value="mg">mg</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteDose(index)}
                  aria-label="Delete dose"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-container">
          <h2>Concentration Over Time</h2>
          {formState.medicationHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={results}
                margin={{ left: 50, right: 20, top: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(time) => {
                    const date = new Date(time);
                    return date.toLocaleTimeString([], {
                      hour: 'numeric',
                      hour12: true
                    });
                  }}
                  ticks={results.filter(point => {
                    const date = new Date(point.time);
                    // Show ticks only for even-numbered hours
                    return date.getMinutes() === 0 && date.getHours() % 2 === 0;
                  }).map(point => point.time)}
                  type="category"
                  interval={0}
                  minTickGap={30}  // Add minimum gap between ticks
                />
                <YAxis
                  label={{
                    value: 'Concentration (mg/L)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -5,
                    style: {
                      textAnchor: 'middle'
                    }
                  }}
                />
                <Tooltip
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    });
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="concentration"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Add doses to view concentration over time</p>
          )}
        </div>
      </form>
    </div>
  )
}

export default App
