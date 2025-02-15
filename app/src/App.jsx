import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

// Add this constant for storing ASM colors
const ASM_COLORS_KEY = 'asmColors';

// Add a new constant for storing custom ASMs
const CUSTOM_ASMS_KEY = 'customAsms';

// Add a new constant for storing visible ASMs
const VISIBLE_ASMS_KEY = 'visibleAsms';

const loadFromLocalStorage = () => {
  try {
    const savedState = localStorage.getItem('formState');
    if (!savedState) return null;

    const parsedState = JSON.parse(savedState);

    // Load saved ASM colors
    const savedColors = localStorage.getItem(ASM_COLORS_KEY);
    if (savedColors) {
      Object.assign(ASM_COLORS, JSON.parse(savedColors));
    }

    // Load saved custom ASMs and merge with defaults
    const savedCustomAsms = localStorage.getItem(CUSTOM_ASMS_KEY);
    if (savedCustomAsms) {
      const customAsms = JSON.parse(savedCustomAsms);
      Object.assign(DEFAULT_ASM_PARAMETERS, customAsms);
    }

    // Load saved visible ASMs
    const savedVisibleASMs = localStorage.getItem(VISIBLE_ASMS_KEY);
    if (savedVisibleASMs) {
      parsedState.visibleASMs = JSON.parse(savedVisibleASMs);
    }

    // Merge saved ASM parameters with defaults
    if (parsedState.asmParameters) {
      parsedState.asmParameters = Object.fromEntries(
        Object.entries(DEFAULT_ASM_PARAMETERS).map(([asmName, defaultParams]) => {
          const savedParams = parsedState.asmParameters[asmName] || {};
          return [asmName, {
            ...defaultParams,
            ...savedParams,
            enabled: savedParams.enabled ?? defaultParams.enabled,
            defaultDosage: savedParams.defaultDosage ?? defaultParams.defaultDosage,
            defaultUnit: savedParams.defaultUnit ?? defaultParams.defaultUnit
          }];
        })
      );
    }

    // Ensure all medication entries have string dosage values
    if (parsedState.medicationHistory) {
      parsedState.medicationHistory = parsedState.medicationHistory.map(med => ({
        ...med,
        asmType: med.asmType || Object.keys(DEFAULT_ASM_PARAMETERS)[0],
        dosage: med.dosage.toString() // Convert to string
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

// Update DEFAULT_ASM_PARAMETERS to add a third ASM and set isCollapsed to false
const DEFAULT_ASM_PARAMETERS = {
  'Levetiracetam': {
    halfLife: 6,
    vd: 0.7,
    bioavailability: 1.0,
    isCollapsed: false,
    enabled: false,
    defaultDosage: 500,
    defaultUnit: 'mg'
  },
  'Valproate': {
    halfLife: 14,
    vd: 0.2,
    bioavailability: 0.9,
    isCollapsed: false,
    enabled: false,
    defaultDosage: 200,
    defaultUnit: 'mg'
  },
  'Carbamazepine': {  // Add third ASM
    halfLife: 12,
    vd: 1.4,
    bioavailability: 0.8,
    isCollapsed: false,
    enabled: false,
    defaultDosage: 200,
    defaultUnit: 'mg'
  }
};

const DEFAULT_ASM_TEMPLATE = {
  halfLife: 12,
  vd: 0.7,
  bioavailability: 1.0,
  isCollapsed: false,
  enabled: true,
  defaultDosage: 200,
  defaultUnit: 'mg'
};

// Update CHART_COLORS to include more colors for custom ASMs
const CHART_COLORS = [
  '#ff7300',  // Total (always first)
  '#8884d8',  // First ASM
  '#377eb8',  // Second ASM
  '#82ca9d',  // Third ASM
  '#ffc658',  // Fourth ASM
  '#e7969c',
  '#984ea3',
  '#1b9e77',
  '#e7298a',
  '#b5cf6b'
];

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
      time: new Date(entry.time).getTime()
    }));
};

// Update the ASM_COLORS to include the new ASM
const ASM_COLORS = {
  'Levetiracetam': CHART_COLORS[1],
  'Valproate': CHART_COLORS[2],
  'Carbamazepine': CHART_COLORS[3]  // Add color for new ASM
};

function App() {
  const [results, setResults] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [visibleASMs, setVisibleASMs] = useState(() => {
    const savedState = loadFromLocalStorage();
    return savedState?.visibleASMs || ['Total', ...Object.keys(DEFAULT_ASM_PARAMETERS)];
  });
  const [formState, setFormState] = useState(() => {
    const savedState = loadFromLocalStorage();
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

  const [showAddAsmForm, setShowAddAsmForm] = useState(false);
  const [newAsmName, setNewAsmName] = useState('');
  const newAsmInputRef = useRef(null);

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
        setResults([]);
      }
    };

    calculateConcentrations();
  }, [formState]);

  useEffect(() => {
    if (results && results.length > 0) {
      const activeASMs = [...new Set(formState.medicationHistory.map(med => med.asmType))];
      const series = [];

      // Get keys from results, excluding 'time'
      const keys = Object.keys(results[0]).filter(k => k !== 'time');

      // Only include Total if there are multiple active ASMs
      const displayKeys = activeASMs.length >= 2 ? keys : keys.filter(k => k !== 'Total');

      // First add Total if it exists in displayKeys (always orange)
      if (displayKeys.includes('Total')) {
        series.push({
          name: 'Total',
          data: results.map(d => ({
            time: new Date(d.time).getTime(),
            concentration: d['Total']
          })),
          color: CHART_COLORS[0] // orange for Total
        });
      }

      // Then add individual ASMs with their consistent colors
      activeASMs.forEach(asmType => {
        if (displayKeys.includes(asmType)) {
          series.push({
            name: asmType,
            data: results.map(d => ({
              time: new Date(d.time).getTime(),
              concentration: d[asmType]
            })),
            color: ASM_COLORS[asmType]
          });
        }
      });

      setChartData(series);
    } else {
      setChartData([]);
    }
  }, [results, formState.medicationHistory]);

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
    // Round to nearest minute by setting seconds and milliseconds to 0
    now.setSeconds(0, 0);
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

  const toggleASM = (asmName) => {
    const activeASMs = [...new Set(formState.medicationHistory.map(med => med.asmType))];

    // If there's only one ASM, don't allow toggling
    if (activeASMs.length < 2) {
      return;
    }

    setVisibleASMs(current => {
      const newVisibleASMs = current.includes(asmName)
        ? current.filter(name => name !== asmName)
        : [...current, asmName];
      localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify(newVisibleASMs));
      return newVisibleASMs;
    });
  };

  const downloadCSV = () => {
    if (results.length === 0) return;

    // Get ASM types that have doses in medication history
    const activatedASMs = [...new Set(formState.medicationHistory.map(med => med.asmType))];

    // Create headers with Time first, then individual ASMs, then Total last
    const headers = ['Time', ...activatedASMs, 'Total'];

    const csvContent = [
      headers.join(','),
      ...results.map(row => {
        const time = new Date(row.time);
        return headers.map(header => {
          if (header === 'Time') {
            return time.toISOString();
          }
          return (row[header] || 0).toFixed(2);
        }).join(',');
      })
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `asm_concentrations_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Update the getAsmColor function
  const getAsmColor = (asmType) => {
    // Always return the consistent color for each ASM
    return ASM_COLORS[asmType];
  };

  const handleAddCustomAsm = () => {
    if (!newAsmName.trim()) {
      alert('Please enter an ASM name');
      newAsmInputRef.current?.focus();
      return;
    }

    // Check if ASM name already exists
    if (formState.asmParameters[newAsmName]) {
      alert('An ASM with this name already exists');
      newAsmInputRef.current?.select();
      return;
    }

    // Find the first unused color from CHART_COLORS, excluding the Total color
    const usedColors = new Set([CHART_COLORS[0], ...Object.values(ASM_COLORS)]); // Include Total color
    const newColor = CHART_COLORS.slice(1).find(color => !usedColors.has(color)) ||
      CHART_COLORS[1 + (Object.keys(formState.asmParameters).length % (CHART_COLORS.length - 1))];

    // Update ASM colors first
    ASM_COLORS[newAsmName] = newColor;

    // Save updated colors to localStorage
    localStorage.setItem(ASM_COLORS_KEY, JSON.stringify(ASM_COLORS));

    // Add new ASM to DEFAULT_ASM_PARAMETERS
    DEFAULT_ASM_PARAMETERS[newAsmName] = { ...DEFAULT_ASM_TEMPLATE };

    // Save custom ASMs to localStorage
    const customAsms = Object.fromEntries(
      Object.entries(DEFAULT_ASM_PARAMETERS)
        .filter(([name]) => !['Levetiracetam', 'Valproate', 'Carbamazepine'].includes(name))
    );
    localStorage.setItem(CUSTOM_ASMS_KEY, JSON.stringify(customAsms));

    // Add new ASM to parameters
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [newAsmName]: {
          ...DEFAULT_ASM_TEMPLATE
        }
      }
    }));

    // Add the new ASM to visible ASMs
    setVisibleASMs(prev => [...prev, newAsmName]);

    // Reset form
    setNewAsmName('');
    setShowAddAsmForm(false);
  };

  // Add a new useEffect to save visibleASMs when they change
  useEffect(() => {
    localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify(visibleASMs));
  }, [visibleASMs]);

  // Add this function to handle ASM deletion
  const handleDeleteASM = (asmName) => {
    // Don't allow deleting if it's one of the default ASMs
    if (['Levetiracetam', 'Valproate', 'Carbamazepine'].includes(asmName)) {
      alert('Default ASMs cannot be deleted');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${asmName}? This will remove all doses and parameters associated with it.`)) {
      return;
    }

    // Remove from ASM parameters
    const newAsmParameters = { ...formState.asmParameters };
    delete newAsmParameters[asmName];

    // Remove from ASM colors
    const newAsmColors = { ...ASM_COLORS };
    delete newAsmColors[asmName];

    // Remove from visible ASMs
    setVisibleASMs(prev => prev.filter(name => name !== asmName));

    // Update form state
    setFormState(prev => ({
      ...prev,
      asmParameters: newAsmParameters,
      medicationHistory: prev.medicationHistory.filter(med => med.asmType !== asmName)
    }));

    // Update localStorage
    localStorage.setItem(ASM_COLORS_KEY, JSON.stringify(newAsmColors));

    // Update custom ASMs in localStorage
    const customAsms = Object.fromEntries(
      Object.entries(newAsmParameters)
        .filter(([name]) => !['Levetiracetam', 'Valproate', 'Carbamazepine'].includes(name))
    );
    localStorage.setItem(CUSTOM_ASMS_KEY, JSON.stringify(customAsms));

    // Update ASM_COLORS object
    Object.assign(ASM_COLORS, newAsmColors);
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
                onChange={e => setFormState({
                  ...formState,
                  weight: Number(e.target.value) // Convert to number
                })}
                step="0.1"
                required
              />
            </label>

            <div className="asm-toggle-group">
              <h3>Available ASMs</h3>
              {Object.entries(formState.asmParameters).map(([asmName, params]) => (
                <label
                  key={asmName}
                  className="asm-checkbox"
                  style={{
                    '--checkbox-color': ASM_COLORS[asmName],
                    color: ASM_COLORS[asmName],
                    backgroundColor: `${ASM_COLORS[asmName]}15`,
                    borderLeft: `4px solid ${ASM_COLORS[asmName]}`,
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}
                >
                  <div className="asm-checkbox-content">
                    <input
                      type="checkbox"
                      checked={params.enabled}
                      onChange={(e) => {
                        const newParams = { ...formState.asmParameters };
                        newParams[asmName].enabled = e.target.checked;

                        setFormState(prev => ({
                          ...prev,
                          asmParameters: newParams,
                          medicationHistory: prev.medicationHistory.filter(
                            med => med.asmType !== asmName || e.target.checked
                          )
                        }));
                      }}
                    />
                    {asmName}
                  </div>
                  <button
                    type="button"
                    className="asm-delete-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteASM(asmName);
                    }}
                  >
                    ×
                  </button>
                </label>
              ))}

              {showAddAsmForm ? (
                <div className="add-asm-form">
                  <input
                    ref={newAsmInputRef}
                    type="text"
                    value={newAsmName}
                    onChange={(e) => setNewAsmName(e.target.value)}
                    placeholder="Enter ASM name"
                    required
                  />
                  <button
                    type="button"
                    className="confirm-btn"
                    onClick={handleAddCustomAsm}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setShowAddAsmForm(false);
                      setNewAsmName('');
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="add-asm-btn"
                  onClick={() => {
                    setShowAddAsmForm(true);
                    setTimeout(() => newAsmInputRef.current?.focus(), 0);
                  }}
                >
                  + Add ASM
                </button>
              )}
            </div>
          </div>

          <div className="form-section medication-history">
            <h2>Medication History</h2>
            <div className="button-row">
              <div className="add-dose-dropdown">
                <button type="button" className="add-dose-btn" onClick={() => {
                  const dropdownEl = document.getElementById('add-dose-dropdown');
                  dropdownEl.style.display = dropdownEl.style.display === 'none' ? 'block' : 'none';
                }}>
                  + Add New Dose
                </button>
                <div id="add-dose-dropdown" className="dropdown-content" style={{ display: 'none' }}>
                  {Object.keys(formState.asmParameters)
                    .filter(asmType => formState.asmParameters[asmType].enabled)
                    .map(asmType => {
                      const params = formState.asmParameters[asmType];
                      return (
                        <button
                          key={asmType}
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            now.setSeconds(0, 0);
                            const localISOTime = now.toISOString();

                            const newDose = {
                              timestamp: localISOTime,
                              dosage: String(params.defaultDosage),
                              unit: params.defaultUnit,
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
                      );
                    })}
                </div>
              </div>
            </div>
            {Object.values(formState.asmParameters).some(p => p.enabled) ? (
              /* Group doses by ASM type */
              Object.keys(formState.asmParameters)
                .filter(asmType => formState.asmParameters[asmType].enabled)
                .map(asmType => (
                  <div key={asmType} className="asm-dose-group">
                    <div
                      className="asm-dose-header"
                      onClick={() => {
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
                      }}
                      style={{
                        backgroundColor: `${getAsmColor(asmType)}15`,
                        borderLeft: `4px solid ${getAsmColor(asmType)}`
                      }}
                    >
                      <h3 style={{ color: getAsmColor(asmType) }}>{asmType}</h3>
                      <span
                        className="collapse-indicator"
                        style={{ color: getAsmColor(asmType) }}
                      >
                        {formState.asmParameters[asmType].isCollapsed ? '▼' : '▲'}
                      </span>
                    </div>

                    {!formState.asmParameters[asmType].isCollapsed &&
                      formState.medicationHistory
                        .filter(med => med.asmType === asmType)
                        .map((med, index) => (
                          <div
                            key={`${asmType}-${index}`}
                            className="dose-entry"
                            style={{
                              backgroundColor: `${getAsmColor(asmType)}08`,
                              borderRadius: '4px',
                              padding: '8px'
                            }}
                          >
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
                ))
            ) : (
              <p className="no-data">Choose an ASM on the left to add doses</p>
            )}
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h2>ASM Concentration Over Time</h2>
            {chartData.length > 0 && (
              <button
                type="button"
                onClick={downloadCSV}
                className="download-csv-btn"
              >
                Download CSV
              </button>
            )}
          </div>
          <div className="asm-selector">
            {(() => {
              const activeASMs = [...new Set(formState.medicationHistory.map(med => med.asmType))];

              if (activeASMs.length === 1) {
                // For single ASM, just show the name with its color
                const asmName = activeASMs[0];
                const asmColor = ASM_COLORS[asmName];
                return (
                  <span
                    className="asm-label"
                    style={{
                      color: asmColor,
                      backgroundColor: `${asmColor}15`,
                      borderLeft: `4px solid ${asmColor}`,
                      fontWeight: 500
                    }}
                  >
                    {asmName}
                  </span>
                );
              }

              // Multiple ASMs - show toggles
              if (activeASMs.length >= 2) {
                const asmColorMap = new Map();
                chartData.forEach((series) => {
                  asmColorMap.set(series.name, series.color || CHART_COLORS[0]);
                });

                return chartData.map(series => {
                  const color = asmColorMap.get(series.name);
                  return (
                    <label
                      key={series.name}
                      className="asm-checkbox"
                      style={{
                        '--checkbox-color': color,
                        color: color,
                        backgroundColor: `${color}15`,
                        borderLeft: `4px solid ${color}`,
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={visibleASMs.includes(series.name)}
                        onChange={() => toggleASM(series.name)}
                      />
                      {series.name}
                    </label>
                  );
                });
              }

              return null;
            })()}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <LineChart
                margin={{ left: 50, right: 20, top: 20, bottom: 20 }}
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
                  formatter={(value) => value.toFixed(2)}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      // Sort payload to put Total first
                      const sortedPayload = [...payload].sort((a, b) => {
                        if (a.name === 'Total') return -1;
                        if (b.name === 'Total') return 1;
                        return 0;
                      });

                      return (
                        <div className="custom-tooltip">
                          <p className="tooltip-time">{new Date(label).toLocaleString()}</p>
                          {sortedPayload.map(entry => (
                            <p
                              key={entry.name}
                              style={{ color: entry.color }}
                            >
                              {entry.name} : {entry.value.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {chartData.map((series) => (
                  <Line
                    key={series.name}
                    type="monotone"
                    dataKey="concentration"
                    data={series.data}
                    name={series.name}
                    stroke={series.color || CHART_COLORS[0]} // Use series-specific color or fallback
                    strokeWidth={3}
                    dot={false}
                    opacity={series.name === 'Total' ? (visibleASMs.includes('Total') ? 1 : 0) : 1}
                    hide={series.name !== 'Total' && !visibleASMs.includes(series.name)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Add a dose above to view the graph</p>
          )}
        </div>

        <div className="asm-parameters-container">
          <h2>ASM Parameters</h2>
          <div className="asm-parameters-grid">
            {Object.entries(formState.asmParameters)
              .filter(([_, params]) => params.enabled)
              .map(([asmName, params]) => (
                <div
                  key={asmName}
                  className={`asm-params-group ${params.enabled ? 'enabled' : ''}`}
                  style={{
                    backgroundColor: `${ASM_COLORS[asmName]}08`,
                    borderLeft: `4px solid ${ASM_COLORS[asmName]}`
                  }}
                >
                  <h3 style={{ color: ASM_COLORS[asmName] }}>{asmName}</h3>
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
            {!Object.values(formState.asmParameters).some(p => p.enabled) && (
              <p className="no-data">Choose an ASM to view and edit parameters</p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export default App;