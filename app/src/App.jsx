import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const ASM_COLORS_KEY = 'asmColors';
const CUSTOM_ASMS_KEY = 'customAsms';
const VISIBLE_ASMS_KEY = 'visibleAsms';

const TIME_RANGES = [
  { label: '4 hours', value: 4 },
  { label: '8 hours', value: 8 },
  { label: '12 hours', value: 12 },
  { label: '1 day', value: 24 },
  { label: '2 days', value: 48 },
  { label: '3 days', value: 72 },
];

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

const ASM_COLORS = {
  'Levetiracetam': CHART_COLORS[1],
  'Valproate': CHART_COLORS[2],
  'Carbamazepine': CHART_COLORS[3]
};

const TOTAL_COLOR = CHART_COLORS[0];

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

  const [timeRange, setTimeRange] = useState(24);
  const [timeOffset, setTimeOffset] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem('formState', JSON.stringify(formState));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [formState]);

  // Fetch data from API whenever inputs change
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_weight: formState.weight,
            medications: formState.medicationHistory,
            asm_parameters: formState.asmParameters,
            time_range: timeRange,
            time_offset: timeOffset
          })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Transform data for Recharts
        const series = data.results.map(asm => ({
          asm: asm.asm,
          data: asm.times.map((t, i) => ({
            time: new Date(t).getTime(),
            [asm.asm]: asm.concentrations[i]
          }))
        }));

        // Ensure Total is always last in the array
        const totalIndex = series.findIndex(s => s.asm === 'Total');
        if (totalIndex !== -1) {
          const total = series.splice(totalIndex, 1)[0];
          series.push(total);
        }

        setChartData(series);

        // Add Total to visible ASMs if multiple ASMs are active
        if (series.length >= 3 && !visibleASMs.includes('Total')) {  // 3 because Total counts as one
          setVisibleASMs(prev => [...prev, 'Total']);
        }

      } catch (error) {
        console.error('Calculation error:', error);
      }
    };

    fetchData();
  }, [formState, timeRange, timeOffset]);

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
    // Round to nearest minute
    now.setSeconds(0, 0);
    const localISOTime = now.toISOString();

    // Find first non-collapsed ASM type
    const defaultAsmType = Object.entries(formState.asmParameters)
      .find(([_, params]) => !params.isCollapsed)?.[0]
      || Object.keys(formState.asmParameters)[0];

    // Ensure the ASM section is expanded
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [defaultAsmType]: {
          ...prev.asmParameters[defaultAsmType],
          isCollapsed: false  // Ensure section is expanded
        }
      },
      medicationHistory: [...prev.medicationHistory, {
        timestamp: localISOTime,
        dosage: "500",
        unit: "mg",
        asmType: defaultAsmType,
        taken: true
      }]
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
    if (chartData.length === 0) return;

    // Sort series to ensure Total is last in CSV
    const sortedSeries = [...chartData].sort((a, b) => {
      if (a.asm === 'Total') return 1;
      if (b.asm === 'Total') return -1;
      return 0;
    });

    // Get all unique timestamps from the data
    const allTimestamps = new Set();
    sortedSeries.forEach(series => {
      series.data.forEach(point => {
        allTimestamps.add(point.time);
      });
    });

    // Convert to array and sort
    const timestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Create headers: Time first, then individual ASMs, then Total last
    const asmNames = sortedSeries.map(s => s.asm);
    const headers = ['Time', ...asmNames];

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...timestamps.map(timestamp => {
        const row = [new Date(timestamp).toISOString()];

        // Add concentration for each ASM
        asmNames.forEach(asmName => {
          const series = sortedSeries.find(s => s.asm === asmName);
          const point = series.data.find(p => p.time === timestamp);
          row.push(point ? point[asmName].toFixed(2) : '0.00');
        });

        return row.join(',');
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

  // Update the getAsmColor function to handle Total specially
  const getAsmColor = (asmType) => {
    if (asmType === 'Total') {
      return TOTAL_COLOR;
    }
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

  // Update the time formatting helper to show date on first tick if no midnight
  const formatXAxis = (timestamp) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Get all ticks to identify day changes
    const ticks = (() => {
      const now = Date.now() + (timeOffset * 60 * 60 * 1000);
      const [startTime, endTime] = getTimeWindowBounds(now, timeRange);
      const points = [];
      const start = new Date(startTime);
      const totalHours = Math.ceil((endTime - startTime) / (60 * 60 * 1000));
      const hourInterval = timeRange <= 24 ? 1 : timeRange <= 48 ? 2 : 3;

      for (let i = 0; i <= totalHours; i += hourInterval) {
        const tickTime = new Date(start);
        tickTime.setHours(tickTime.getHours() + i);
        points.push(tickTime.getTime());
      }
      return points;
    })();

    // Show date if it's the first tick OR if it's the first tick of a new day
    const isFirstTick = timestamp === ticks[0];
    const isFirstTickOfDay = ticks.findIndex((tick, index) => {
      if (index === 0) return false;
      const prevDate = new Date(ticks[index - 1]).getDate();
      const currentDate = new Date(tick).getDate();
      return tick === timestamp && prevDate !== currentDate;
    }) !== -1;

    if (isFirstTick || isFirstTickOfDay) {
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
    }

    return time;
  };

  const formatTooltip = (value, name) => {
    return [`${value.toFixed(2)} mg/L`, name];
  };

  // When editing a dose time
  const handleDoseTimeChange = (e, globalIndex) => {
    const newHistory = [...formState.medicationHistory];
    const date = new Date(e.target.value);
    // Ensure time is rounded to the minute
    date.setSeconds(0, 0);
    // Convert to UTC ISO string
    newHistory[globalIndex].timestamp = date.toISOString();
    setFormState(prev => ({
      ...prev,
      medicationHistory: newHistory
    }));
  };

  // Update the helper function to start from current time
  const getTimeWindowBounds = (now, timeRange) => {
    // Start at current time and extend forward by timeRange hours
    const start = new Date(now);
    const end = new Date(now + (timeRange * 60 * 60 * 1000));

    // Round to nearest hour
    start.setMinutes(0, 0, 0);
    end.setMinutes(0, 0, 0);

    return [start.getTime(), end.getTime()];
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

                            setFormState(prev => ({
                              ...prev,
                              asmParameters: {
                                ...prev.asmParameters,
                                [asmType]: {
                                  ...prev.asmParameters[asmType],
                                  isCollapsed: false  // Ensure section is expanded
                                }
                              },
                              medicationHistory: [...prev.medicationHistory, {
                                timestamp: localISOTime,
                                dosage: String(params.defaultDosage),
                                unit: params.defaultUnit,
                                asmType: asmType,
                                taken: true
                              }]
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
                  <div
                    key={asmType}
                    className="asm-dose-group"
                  >
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
                      <h3 style={{ color: getAsmColor(asmType) }}>
                        {asmType} ({formState.medicationHistory.filter(med => med.asmType === asmType).length})
                      </h3>
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
                                onChange={(e) => {
                                  const globalIndex = formState.medicationHistory.indexOf(med);
                                  handleDoseTimeChange(e, globalIndex);
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
            <div className="chart-title-row">
              <h2>ASM Concentration Over Time</h2>
              <div className="time-controls">
                <button
                  type="button"
                  onClick={() => {
                    setTimeOffset(0); // Only reset offset to current time
                  }}
                  className="time-shift-btn reset-btn"
                  title="Reset to current time"
                >
                  ↺
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffset(curr => curr - 8)}
                  className="time-shift-btn"
                  title="Back 8 hours"
                >
                  ◀◀
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffset(curr => curr - 4)}
                  className="time-shift-btn"
                  title="Back 4 hours"
                >
                  ◀
                </button>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(Number(e.target.value))}
                  className="time-range-select"
                >
                  {TIME_RANGES.map(range => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setTimeOffset(curr => curr + 4)}
                  className="time-shift-btn"
                  title="Forward 4 hours"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffset(curr => curr + 8)}
                  className="time-shift-btn"
                  title="Forward 8 hours"
                >
                  ▶▶
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffset(0)}
                  className="time-shift-btn refresh-btn"
                  title="Update to current time"
                >
                  ↻
                </button>
              </div>
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
                    key={`selector-${asmName}`}
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
                // Sort series to ensure Total is first
                const sortedSeries = [...chartData].sort((a, b) => {
                  if (a.asm === 'Total') return -1;
                  if (b.asm === 'Total') return 1;
                  return 0;
                });

                return sortedSeries.map(series => (
                  <label
                    key={`selector-${series.asm}`}
                    className="asm-checkbox"
                    style={{
                      '--checkbox-color': getAsmColor(series.asm),
                      color: getAsmColor(series.asm),
                      backgroundColor: `${getAsmColor(series.asm)}15`,
                      borderLeft: `4px solid ${getAsmColor(series.asm)}`,
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleASMs.includes(series.asm)}
                      onChange={() => toggleASM(series.asm)}
                    />
                    {series.asm}
                  </label>
                ));
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
                  domain={(() => {
                    const now = Date.now() + (timeOffset * 60 * 60 * 1000);
                    return getTimeWindowBounds(now, timeRange);
                  })()}
                  tickFormatter={formatXAxis}
                  scale="time"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  ticks={(() => {
                    const now = Date.now() + (timeOffset * 60 * 60 * 1000);
                    const [startTime, endTime] = getTimeWindowBounds(now, timeRange);
                    const points = [];

                    // Determine tick interval based on time range
                    const hourInterval = timeRange <= 24 ? 1 :
                      timeRange <= 48 ? 2 :
                        3;

                    // Generate ticks from midnight to midnight
                    const start = new Date(startTime);
                    const totalHours = Math.ceil((endTime - startTime) / (60 * 60 * 1000));

                    for (let i = 0; i <= totalHours; i += hourInterval) {
                      const tickTime = new Date(start);
                      tickTime.setHours(tickTime.getHours() + i);
                      points.push(tickTime.getTime());
                    }
                    return points;
                  })()}
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
                  labelFormatter={formatXAxis}
                  formatter={formatTooltip}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
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
                              key={`tooltip-${entry.name}`}
                              style={{ color: entry.color }}
                            >
                              {entry.name}: {entry.value.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {chartData
                  .sort((a, b) => {
                    if (a.asm === 'Total') return -1;
                    if (b.asm === 'Total') return 1;
                    return 0;
                  })
                  .map((series) => {
                    const now = Date.now() + (timeOffset * 60 * 60 * 1000);
                    const [startTime, endTime] = getTimeWindowBounds(now, timeRange);

                    // Get dose times for this ASM
                    const doseTimes = new Set(
                      formState.medicationHistory
                        .filter(med => med.asmType === series.asm)
                        .map(med => new Date(med.timestamp).getTime())
                    );

                    const filteredData = series.data.filter(point =>
                      point.time >= startTime &&
                      point.time <= endTime &&
                      (point[series.asm] >= 0.01 || doseTimes.has(point.time))  // Consider values < 0.01 as 0
                    );

                    // Round very small values to 0
                    const processedData = filteredData.map(point => ({
                      ...point,
                      [series.asm]: point[series.asm] < 0.01 ? 0 : point[series.asm]
                    }));

                    return (
                      <Line
                        key={`line-${series.asm}`}
                        type="monotone"
                        dataKey={series.asm}
                        data={processedData}
                        name={series.asm}
                        stroke={getAsmColor(series.asm)}
                        strokeWidth={3}
                        dot={false}
                        opacity={series.asm === 'Total' ? (visibleASMs.includes('Total') ? 1 : 0) : 1}
                        hide={series.asm !== 'Total' && !visibleASMs.includes(series.asm)}
                        connectNulls={true}
                      />
                    );
                  })}
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