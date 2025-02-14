import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const loadFromLocalStorage = () => {
  try {
    const savedState = localStorage.getItem('formState');
    if (!savedState) return null;

    const parsedState = JSON.parse(savedState);

    // Ensure all medication entries have an ASM type
    if (parsedState.medicationHistory) {
      parsedState.medicationHistory = parsedState.medicationHistory.map(med => ({
        ...med,
        asmType: med.asmType || Object.keys(DEFAULT_ASM_PARAMETERS)[0] // Default to first ASM type
      }));
    }

    return parsedState;
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

// Add default ASM parameters
const DEFAULT_ASM_PARAMETERS = {
  'Levetiracetam': {
    halfLife: 6,
    vd: 0.7,
    bioavailability: 1.0,
    isCollapsed: false
  },
  'Valproate': {
    halfLife: 14,
    vd: 0.2,
    bioavailability: 0.9,
    isCollapsed: false
  }
};

const processChartData = (rawData) => {
  const grouped = rawData.reduce((acc, entry) => {
    const time = new Date(entry.time).getTime();
    if (!acc[time]) {
      acc[time] = { time: entry.time };
    }
    acc[time][entry.asmType] = entry.concentration;
    return acc;
  }, {});

  return Object.values(grouped)
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .map(entry => ({
      ...entry,
      time: new Date(entry.time).getTime() // Convert to timestamp
    }));
};

function App() {
  const [results, setResults] = useState([])
  const [formState, setFormState] = useState(() => {
    const savedState = loadFromLocalStorage();
    // Clear localStorage if it contains old format data
    if (savedState?.medicationHistory?.some(med => !med.asmType)) {
      localStorage.removeItem('formState');
      return {
        weight: 70,
        asmParameters: DEFAULT_ASM_PARAMETERS,
        medicationHistory: []
      };
    }
    return {
      weight: savedState?.weight || 70,
      asmParameters: savedState?.asmParameters || DEFAULT_ASM_PARAMETERS,
      medicationHistory: savedState?.medicationHistory || []
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
            weight: parseFloat(formState.weight),
            asmParameters: formState.asmParameters,
            medicationHistory: formState.medicationHistory.map(med => ({
              timestamp: med.timestamp,
              dosage: convertToMg(parseFloat(med.dosage), med.unit),
              asmType: med.asmType,
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdown = document.getElementById('add-dose-dropdown');
      const button = event.target.closest('.add-dose-btn');
      if (dropdown && !button && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const convertToMg = (value, unit) => {
    switch (unit) {
      case 'ug': return value / 1000;
      case 'g': return value * 1000;
      default: return value;
    }
  };

  const addDose = () => {
    const now = new Date();
    const localISOTime = now.toISOString();

    // Find first non-collapsed ASM type
    const defaultAsmType = Object.entries(formState.asmParameters)
      .find(([_, params]) => !params.isCollapsed)?.[0]
      || Object.keys(formState.asmParameters)[0];

    const newDose = {
      timestamp: localISOTime,
      dosage: "500",
      unit: "mg",
      asmType: defaultAsmType,
      taken: true
    };
    setFormState(prev => ({
      ...prev,
      medicationHistory: [...prev.medicationHistory, newDose]
    }));
  };

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
            <label htmlFor="patient-weight">
              Weight (kg):
              <input
                id="patient-weight"
                name="patient-weight"
                type="number"
                value={formState.weight}
                onChange={e => setFormState({ ...formState, weight: e.target.value })}
                step="0.1"
                required
              />
            </label>
          </div>

          <div className="form-section medication-history">
            <h2>Medication History</h2>
            <div className="button-row">
              <div className="add-dose-dropdown">
                <button type="button" className="add-dose-btn" onClick={() => {
                  const dropdownEl = document.getElementById('add-dose-dropdown');
                  dropdownEl.style.display = dropdownEl.style.display === 'none' ? 'block' : 'none';
                }}>
                  Add New Dose
                </button>
                <div id="add-dose-dropdown" className="dropdown-content" style={{ display: 'none' }}>
                  {Object.keys(formState.asmParameters).map(asmType => (
                    <button
                      key={asmType}
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const localISOTime = now.toISOString();

                        const newDose = {
                          timestamp: localISOTime,
                          dosage: "500",
                          unit: "mg",
                          asmType: asmType,
                          taken: true
                        };
                        setFormState(prev => ({
                          ...prev,
                          medicationHistory: [...prev.medicationHistory, newDose]
                        }));
                        document.getElementById('add-dose-dropdown').style.display = 'none';
                      }}
                    >
                      {asmType}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Group doses by ASM type */}
            {Object.keys(formState.asmParameters).map(asmType => (
              <div key={asmType} className="asm-dose-group">
                <div className="asm-dose-header" onClick={() => {
                  // Toggle visibility of this ASM type's doses
                  setFormState(prev => ({
                    ...prev,
                    asmParameters: {
                      ...prev.asmParameters,
                      [asmType]: {
                        ...prev.asmParameters[asmType],
                        isCollapsed: !prev.asmParameters[asmType].isCollapsed
                      }
                    }
                  }));
                }}>
                  <h3>{asmType}</h3>
                  <span className="collapse-indicator">
                    {formState.asmParameters[asmType].isCollapsed ? '▼' : '▲'}
                  </span>
                </div>

                {!formState.asmParameters[asmType].isCollapsed &&
                  formState.medicationHistory
                    .filter(med => med.asmType === asmType)
                    .map((med, index) => (
                      <div key={`${asmType}-${index}`} className="dose-entry">
                        <div className="dose-entry-inputs">
                          <input
                            id={`dose-time-${asmType}-${index}`}
                            name={`dose-time-${asmType}-${index}`}
                            type="datetime-local"
                            value={formatLocalDateTime(med.timestamp)}
                            onChange={e => {
                              const newHistory = [...formState.medicationHistory];
                              const globalIndex = formState.medicationHistory.indexOf(med);
                              const date = new Date(e.target.value);
                              // Convert to UTC ISO string
                              newHistory[globalIndex].timestamp = date.toISOString();
                              setFormState(prev => ({
                                ...prev,
                                medicationHistory: newHistory
                              }));
                            }}
                            required
                          />
                          <div className="dose-value-group">
                            <input
                              id={`dose-value-${asmType}-${index}`}
                              name={`dose-value-${asmType}-${index}`}
                              type="number"
                              value={med.dosage}
                              onChange={e => {
                                const newHistory = [...formState.medicationHistory];
                                const globalIndex = formState.medicationHistory.indexOf(med);
                                newHistory[globalIndex].dosage = e.target.value;
                                setFormState(prev => ({
                                  ...prev,
                                  medicationHistory: newHistory
                                }));
                              }}
                              placeholder="Dosage"
                              min="0"
                              step="any"
                              required
                            />
                            <select
                              id={`dose-unit-${asmType}-${index}`}
                              name={`dose-unit-${asmType}-${index}`}
                              value={med.unit || 'mg'}
                              onChange={e => {
                                const newHistory = [...formState.medicationHistory];
                                const globalIndex = formState.medicationHistory.indexOf(med);
                                newHistory[globalIndex].unit = e.target.value;
                                setFormState(prev => ({
                                  ...prev,
                                  medicationHistory: newHistory
                                }));
                              }}
                            >
                              <option value="ug">µg</option>
                              <option value="mg">mg</option>
                              <option value="g">g</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const globalIndex = formState.medicationHistory.indexOf(med);
                              deleteDose(globalIndex);
                            }}
                            aria-label="Delete dose"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
              </div>
            ))}
          </div>
        </div>

        <div className="chart-container">
          <h2>Concentration Over Time</h2>
          {formState.medicationHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <LineChart
                margin={{ left: 50, right: 20, top: 20, bottom: 20 }}
                data={processChartData(results)}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(unixTime) => {
                    const date = new Date(unixTime);
                    return date.toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    });
                  }}
                  scale="time"
                  angle={-45}
                  textAnchor="end"
                  height={100}
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
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                />
                {Object.keys(formState.asmParameters).map((asmType, idx) => {
                  const color = ['#8884d8', '#82ca9d', '#ffc658'][idx % 3];
                  return (
                    <Line
                      key={asmType}
                      type="monotone"
                      dataKey={asmType}
                      stroke={color}
                      name={asmType}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Add doses to view concentration over time</p>
          )}
        </div>

        <div className="asm-parameters-container">
          <h2>ASM Parameters</h2>
          <div className="asm-parameters-grid">
            {Object.entries(formState.asmParameters).map(([asmName, params]) => (
              <div key={asmName} className="asm-params-group">
                <h3>{asmName}</h3>
                <label htmlFor={`${asmName}-half-life`}>
                  Half-life (hours):
                  <input
                    id={`${asmName}-half-life`}
                    name={`${asmName}-half-life`}
                    type="number"
                    value={params.halfLife}
                    onChange={e => setFormState(prev => ({
                      ...prev,
                      asmParameters: {
                        ...prev.asmParameters,
                        [asmName]: {
                          ...prev.asmParameters[asmName],
                          halfLife: e.target.value
                        }
                      }
                    }))}
                  />
                </label>
                <label htmlFor={`${asmName}-vd`}>
                  Vd (L/kg):
                  <input
                    id={`${asmName}-vd`}
                    name={`${asmName}-vd`}
                    type="number"
                    step="0.1"
                    value={params.vd}
                    onChange={e => setFormState(prev => ({
                      ...prev,
                      asmParameters: {
                        ...prev.asmParameters,
                        [asmName]: {
                          ...prev.asmParameters[asmName],
                          vd: e.target.value
                        }
                      }
                    }))}
                  />
                </label>
                <label htmlFor={`${asmName}-bioavailability`}>
                  Bioavailability (%):
                  <input
                    id={`${asmName}-bioavailability`}
                    name={`${asmName}-bioavailability`}
                    type="number"
                    step="1"
                    value={params.bioavailability * 100}
                    onChange={e => setFormState(prev => ({
                      ...prev,
                      asmParameters: {
                        ...prev.asmParameters,
                        [asmName]: {
                          ...prev.asmParameters[asmName],
                          bioavailability: e.target.value / 100
                        }
                      }
                    }))}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}

export default App
