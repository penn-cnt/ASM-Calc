import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

const ASM_COLORS_KEY = 'asmColors';
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
    if (!savedState) {
      // First time load - use default ASMs
      const defaultState = {
        weight: 70,
        asmParameters: DEFAULT_ASM_PARAMETERS,
        medicationHistory: []
      };
      // Also set default visibleASMs
      const defaultVisibleASMs = Object.keys(DEFAULT_ASM_PARAMETERS);
      localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify(defaultVisibleASMs));
      return { ...defaultState, visibleASMs: defaultVisibleASMs };
    }

    const parsedState = JSON.parse(savedState);

    // Load saved ASM colors
    const savedColors = localStorage.getItem(ASM_COLORS_KEY);
    if (savedColors) {
      Object.assign(ASM_COLORS, JSON.parse(savedColors));
    }

    // Load saved visible ASMs
    const savedVisibleASMs = localStorage.getItem(VISIBLE_ASMS_KEY);
    const visibleASMs = savedVisibleASMs ? JSON.parse(savedVisibleASMs) : Object.keys(parsedState.asmParameters || {});

    // Return combined state
    return {
      weight: parsedState.weight || 70,
      asmParameters: parsedState.asmParameters || {},
      medicationHistory: parsedState.medicationHistory || [],
      visibleASMs
    };
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    const defaultState = {
      weight: 70,
      asmParameters: DEFAULT_ASM_PARAMETERS,
      medicationHistory: [],
      visibleASMs: Object.keys(DEFAULT_ASM_PARAMETERS)
    };
    return defaultState;
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

// Update DEFAULT_ASM_PARAMETERS to remove enabled property
const DEFAULT_ASM_PARAMETERS = {
  'Levetiracetam': {
    halfLife: 6,
    vd: 0.7,
    bioavailability: 1.0,
    isCollapsed: false,
    defaultDosage: 500,
    defaultUnit: 'mg'
  },
  'Valproate': {
    halfLife: 14,
    vd: 0.2,
    bioavailability: 0.9,
    isCollapsed: false,
    defaultDosage: 200,
    defaultUnit: 'mg'
  },
  'Carbamazepine': {
    halfLife: 12,
    vd: 1.4,
    bioavailability: 0.8,
    isCollapsed: false,
    defaultDosage: 200,
    defaultUnit: 'mg'
  }
};

const DEFAULT_ASM_TEMPLATE = {
  halfLife: 12,
  vd: 0.7,
  bioavailability: 1.0,
  isCollapsed: false,
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

// Handle invalid inputs
const invalidInputStyle = {
  border: '2px solid var(--danger-red)',
  backgroundColor: 'rgba(239, 68, 68, 0.05)'
};

function App() {
  const [chartData, setChartData] = useState([]);
  const [visibleASMs, setVisibleASMs] = useState(() => {
    const savedState = loadFromLocalStorage();
    return savedState.visibleASMs;
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
    return savedState;
  });

  const [showAddAsmForm, setShowAddAsmForm] = useState(false);
  const [newAsmName, setNewAsmName] = useState('');
  const newAsmInputRef = useRef(null);

  const [timeRange, setTimeRange] = useState(24);
  const [timeOffset, setTimeOffset] = useState(0);

  // Add state for error handling
  const [parameterErrors, setParameterErrors] = useState({});

  // Add this state for dose errors
  const [doseErrors, setDoseErrors] = useState({});

  // Add state for weight error
  const [weightError, setWeightError] = useState(false);

  const [editingDefaults, setEditingDefaults] = useState(null);

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
        // Validate parameters before making API call
        const invalidParams = {};
        Object.entries(formState.asmParameters).forEach(([asmName, params]) => {
          if (!params.halfLife || params.halfLife <= 0) {
            invalidParams[`${asmName}-half-life`] = true;
          }
          if (!params.vd || params.vd <= 0) {
            invalidParams[`${asmName}-vd`] = true;
          }
          if (!params.bioavailability || params.bioavailability <= 0 || params.bioavailability > 1) {
            invalidParams[`${asmName}-bioavailability`] = true;
          }
        });

        // Check for invalid weight
        const hasInvalidWeight = !Number(formState.weight) || Number(formState.weight) <= 0;

        if (Object.keys(invalidParams).length > 0 || hasInvalidWeight) {
          setParameterErrors(invalidParams);
          return; // Don't make API call if parameters or weight are invalid
        }

        // Create a copy of medication history with empty values replaced with "0"
        const sanitizedMedications = formState.medicationHistory.map(med => ({
          ...med,
          dosage: med.dosage || "0"
        }));

        const response = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_weight: formState.weight,
            medications: sanitizedMedications,  // Use sanitized version
            asm_parameters: formState.asmParameters,
            time_range: timeRange,
            time_offset: timeOffset
          })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Clear any previous errors
        setParameterErrors({});

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

        // Add Total to visible ASMs if multiple ASMs have data
        const asmsWithData = series.filter(s => s.asm !== 'Total').length;
        if (asmsWithData >= 2 && !visibleASMs.includes('Total')) {
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

  const deleteDose = (index) => {
    setFormState(prev => ({
      ...prev,
      medicationHistory: prev.medicationHistory.filter((_, i) => i !== index)
    }));
  };

  const toggleASM = (asmName) => {
    setVisibleASMs(current => {
      const newVisibleASMs = current.includes(asmName)
        ? current.filter(name => name !== asmName)
        : [...current, asmName];

      // Save to localStorage
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

    // Create and trigger download with full timestamp
    const timestamp = new Date().toLocaleString('sv').replace(' ', '_').replace(/:/g, '-');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `asm_concentrations_${timestamp}.csv`);
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

  // Update handleAddCustomAsm to use stored colors first
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

    // Get available colors from localStorage
    let availableColors = JSON.parse(localStorage.getItem('availableColors') || '[]');

    // Get the next color (either from available colors or from CHART_COLORS)
    let newColor;
    if (availableColors.length > 0) {
      newColor = availableColors.shift(); // Take the first available color
      localStorage.setItem('availableColors', JSON.stringify(availableColors));
    } else {
      // If no stored colors, use the next unused color from CHART_COLORS
      const usedColors = new Set(Object.values(ASM_COLORS));
      newColor = CHART_COLORS.slice(1).find(color => !usedColors.has(color)) ||
        CHART_COLORS[1 + (Object.keys(formState.asmParameters).length % (CHART_COLORS.length - 1))];
    }

    // Update ASM colors
    ASM_COLORS[newAsmName] = newColor;

    // Save updated colors to localStorage
    localStorage.setItem(ASM_COLORS_KEY, JSON.stringify(ASM_COLORS));

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

  // Update handleDeleteASM to store the deleted color
  const handleDeleteASM = (asmName) => {
    if (!confirm(`Are you sure you want to delete ${asmName}? This will remove all doses and parameters associated with it.`)) {
      return;
    }

    // Store the color of the ASM being deleted
    const deletedColor = ASM_COLORS[asmName];

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

    // Store the deleted color at the front of available colors array
    if (deletedColor && !Object.values(newAsmColors).includes(deletedColor)) {
      localStorage.setItem('availableColors', JSON.stringify([deletedColor, ...JSON.parse(localStorage.getItem('availableColors') || '[]')]));
    }

    // Update localStorage
    localStorage.setItem(ASM_COLORS_KEY, JSON.stringify(newAsmColors));
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

  // Add this helper function to get all active ASM names
  const getAllAsmNames = (chartData) => {
    return chartData.map(series => series.asm);
  };

  // Add this function to handle expanding the ASM section
  const handleExpandAsm = (asmType) => {
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [asmType]: {
          ...prev.asmParameters[asmType],
          isCollapsed: false
        }
      }
    }));
  };

  // Update the quick add button click handler
  const handleQuickAdd = (e, asmType) => {
    e.stopPropagation(); // Prevent header click event
    const now = new Date();
    now.setSeconds(0, 0);
    const localISOTime = now.toISOString();

    handleExpandAsm(asmType); // Expand the section

    setFormState(prev => ({
      ...prev,
      medicationHistory: [...prev.medicationHistory, {
        timestamp: localISOTime,
        dosage: String(formState.asmParameters[asmType].defaultDosage),
        unit: formState.asmParameters[asmType].defaultUnit,
        asmType: asmType,
        taken: true
      }]
    }));
  };

  // Add this useEffect to handle single ASM visibility
  useEffect(() => {
    const activeASMs = [...new Set(formState.medicationHistory.map(med => med.asmType))];

    // If there's only one ASM, ensure it's visible
    if (activeASMs.length === 1) {
      const singleASM = activeASMs[0];
      if (!visibleASMs.includes(singleASM)) {
        setVisibleASMs([singleASM]);
      }
    }
  }, [formState.medicationHistory]);

  // Add this helper function
  const openDatePicker = (e) => {
    // Find and click the calendar picker indicator
    const indicator = e.target.querySelector('::-webkit-calendar-picker-indicator');
    if (indicator) {
      indicator.click();
    } else {
      // Fallback for Firefox/other browsers
      e.target.showPicker?.();
    }
  };

  const downloadMedicationHistory = () => {
    if (formState.medicationHistory.length === 0) return;

    // Create headers
    const headers = ['Timestamp', 'ASM Type', 'Dosage', 'Unit'];

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...formState.medicationHistory.map(med => [
        new Date(med.timestamp).toISOString(),
        med.asmType,
        med.dosage,
        med.unit
      ].join(','))
    ].join('\n');

    // Create and trigger download with full timestamp
    const timestamp = new Date().toLocaleString('sv').replace(' ', '_').replace(/:/g, '-');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `medication_history_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const EditDefaultsPopup = ({ asm, onSave, onCancel }) => {
    const [form, setForm] = useState({
      dosage: formState.asmParameters[asm]?.defaultDosage || "",
      unit: formState.asmParameters[asm]?.defaultUnit || "mg"
    });
    const [doseError, setDoseError] = useState(false);

    const handleSave = () => {
      const value = Number(form.dosage);
      if (!value || value <= 0) {
        alert('Dose must be greater than 0.');
        return;
      }
      onSave(form);
    };

    return (
      <>
        <div className="popup-overlay" onClick={onCancel} />
        <div className="edit-defaults-popup">
          <h3>Edit Default Dose for {asm}</h3>
          <div className="form-row">
            <input
              type="number"
              value={form.dosage}
              onChange={e => {
                const value = Number(e.target.value);
                setForm(prev => ({ ...prev, dosage: e.target.value }));

                // Update error state
                if (!value || value <= 0) {
                  setDoseError(true);
                } else {
                  setDoseError(false);
                }
              }}
              onBlur={e => {
                const value = Number(e.target.value);
                if (!value || value <= 0) {
                  setTimeout(() => {
                    alert('Dose must be greater than 0.');
                  }, 0);
                }
              }}
              placeholder="Default dose"
              min="0"
              step="any"
              style={doseError ? invalidInputStyle : {}}
              required
            />
            <select
              value={form.unit}
              onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
            >
              <option value="ug">µg</option>
              <option value="mg">mg</option>
              <option value="g">g</option>
            </select>
          </div>
          <div className="button-row">
            <button
              className="cancel-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </>
    );
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
                onChange={e => {
                  const value = Number(e.target.value);
                  setFormState({
                    ...formState,
                    weight: e.target.value // Allow empty value during typing
                  });

                  // Update error state
                  if (!value || value <= 0) {
                    e.target.style.border = invalidInputStyle.border;
                    e.target.style.backgroundColor = invalidInputStyle.backgroundColor;
                    setWeightError(true);
                  } else {
                    e.target.style.border = '';
                    e.target.style.backgroundColor = '';
                    setWeightError(false);
                  }
                }}
                onBlur={e => {
                  const value = Number(e.target.value);
                  if (!value || value <= 0) {
                    setTimeout(() => {
                      alert('Weight must be greater than 0.');
                    }, 0);
                  }
                }}
                step="0.1"
                required
                style={weightError ? invalidInputStyle : {}}
              />
            </label>

            <div className="asm-toggle-group">
              <h3>Active ASMs</h3>
              {Object.entries(formState.asmParameters).map(([asmName, params]) => (
                <div
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
                  <button
                    type="button"
                    className="asm-edit-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingDefaults(asmName);
                    }}
                  >
                    ⋯
                  </button>
                  <div className="asm-checkbox-content">
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
                </div>
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
                  Add ASM
                </button>
              )}
            </div>
          </div>

          <div className="form-section medication-history">
            <h2>Medication History</h2>
            <div className="button-row">
              <div className="add-dose-dropdown">
                <button
                  type="button"
                  className="add-dose-btn"
                  onClick={() => {
                    const dropdownEl = document.getElementById('add-dose-dropdown');
                    dropdownEl.style.display = dropdownEl.style.display === 'none' ? 'block' : 'none';
                  }}
                >
                  Add New Dose
                </button>
                <div id="add-dose-dropdown" className="dropdown-content" style={{ display: 'none' }}>
                  {Object.keys(formState.asmParameters)
                    .map(asmType => {
                      const params = formState.asmParameters[asmType];
                      return (
                        <button
                          key={asmType}
                          type="button"
                          style={{
                            color: ASM_COLORS[asmType],
                            backgroundColor: `${ASM_COLORS[asmType]}15`,
                            borderLeft: `4px solid ${ASM_COLORS[asmType]}`
                          }}
                          onClick={() => {
                            const now = new Date();
                            now.setSeconds(0, 0);
                            const localISOTime = now.toISOString();

                            // Make sure the ASM is visible in the chart
                            if (!visibleASMs.includes(asmType)) {
                              setVisibleASMs(prev => [...prev, asmType]);
                              localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify([...visibleASMs, asmType]));
                            }

                            setFormState(prev => ({
                              ...prev,
                              asmParameters: {
                                ...prev.asmParameters,
                                [asmType]: {
                                  ...prev.asmParameters[asmType],
                                  isCollapsed: false
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
                          + {asmType}
                        </button>
                      );
                    })}
                </div>
              </div>
              {formState.medicationHistory.length > 0 && (
                <button
                  type="button"
                  className="download-csv-btn"
                  onClick={downloadMedicationHistory}
                >
                  Download CSV
                </button>
              )}
            </div>
            {Object.keys(formState.asmParameters).length > 0 ? (
              formState.medicationHistory.length > 0 ? (
                Object.keys(formState.asmParameters)
                  .map(asmType => {
                    const doses = formState.medicationHistory.filter(med => med.asmType === asmType);
                    if (doses.length === 0) return null;

                    return (
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
                            borderLeft: `4px solid ${getAsmColor(asmType)}`,
                            cursor: 'pointer'
                          }}
                        >
                          <h3 style={{ color: getAsmColor(asmType) }}>
                            {asmType} ({doses.length})
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <button
                              type="button"
                              className="quick-add-btn"
                              onClick={(e) => handleQuickAdd(e, asmType)}
                              style={{
                                color: getAsmColor(asmType),
                                border: `1px solid ${getAsmColor(asmType)}`,
                                backgroundColor: '#fff'
                              }}
                            >
                              Quick Add
                            </button>
                            <span
                              className="collapse-indicator"
                              style={{ color: getAsmColor(asmType) }}
                            >
                              {formState.asmParameters[asmType].isCollapsed ? '▼' : '▲'}
                            </span>
                          </div>
                        </div>

                        {!formState.asmParameters[asmType].isCollapsed && doses.map((med, index) => (
                          <div
                            key={`${asmType}-${index}`}
                            className="dose-entry"
                            style={{
                              backgroundColor: `${getAsmColor(asmType)}08`,
                              borderRadius: '4px',
                              padding: '8px'
                            }}
                            data-index={index + 1}
                          >
                            <div className="dose-entry-inputs">
                              <div
                                className="dose-entry-number"
                                style={{
                                  color: getAsmColor(asmType)
                                }}
                              >
                                {index + 1}
                              </div>
                              <input
                                type="datetime-local"
                                value={formatLocalDateTime(med.timestamp)}
                                onChange={(e) => {
                                  const globalIndex = formState.medicationHistory.indexOf(med);
                                  handleDoseTimeChange(e, globalIndex);
                                }}
                                onClick={(e) => openDatePicker(e)}
                                required
                              />
                              <div className="dose-value-group">
                                <input
                                  type="number"
                                  value={med.dosage}
                                  onChange={e => {
                                    const value = Number(e.target.value);
                                    const newHistory = [...formState.medicationHistory];
                                    const globalIndex = formState.medicationHistory.indexOf(med);
                                    // Allow empty value during typing
                                    newHistory[globalIndex].dosage = e.target.value;
                                    setFormState(prev => ({
                                      ...prev,
                                      medicationHistory: newHistory
                                    }));

                                    // Update error state
                                    if (!value || value <= 0) {
                                      e.target.style.border = invalidInputStyle.border;
                                      e.target.style.backgroundColor = invalidInputStyle.backgroundColor;
                                      setDoseErrors(prev => ({
                                        ...prev,
                                        [globalIndex]: true
                                      }));
                                    } else {
                                      e.target.style.border = '';
                                      e.target.style.backgroundColor = '';
                                      setDoseErrors(prev => ({
                                        ...prev,
                                        [globalIndex]: false
                                      }));
                                    }
                                  }}
                                  onBlur={e => {
                                    const value = Number(e.target.value);
                                    if (!value || value <= 0) {
                                      setTimeout(() => {
                                        alert('Dose must be greater than 0.');
                                      }, 0);
                                    }
                                  }}
                                  min="0"
                                  step="any"
                                  required
                                  style={doseErrors[formState.medicationHistory.indexOf(med)] ? invalidInputStyle : {}}
                                />
                                <select
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
                    );
                  })
              ) : (
                <p className="no-data">Click "Add New Dose" to begin the medication history</p>
              )
            ) : (
              <p className="no-data">Add an ASM on the left before adding a dose</p>
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
                    setTimeOffset(0); // Reset offset to current time
                    // Show all active ASMs
                    const allAsms = getAllAsmNames(chartData);
                    setVisibleASMs(allAsms);
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
              const singleASM = activeASMs.length === 1;

              // Sort series to ensure Total is first
              const sortedSeries = [...chartData].sort((a, b) => {
                if (a.asm === 'Total') return -1;
                if (b.asm === 'Total') return 1;
                return 0;
              });

              return sortedSeries.map(series => (
                <label
                  key={`selector-${series.asm}`}
                  className={`asm-selector-checkbox ${singleASM ? 'single-asm' : ''}`}
                  style={{
                    '--checkbox-color': getAsmColor(series.asm),
                    color: getAsmColor(series.asm),
                    backgroundColor: `${getAsmColor(series.asm)}15`,
                    borderLeft: `4px solid ${getAsmColor(series.asm)}`,
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}
                >
                  {!singleASM && (
                    <input
                      type="checkbox"
                      checked={visibleASMs.includes(series.asm)}
                      onChange={() => toggleASM(series.asm)}
                    />
                  )}
                  {series.asm}
                </label>
              ));
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
                      // Find the exact data point for this timestamp from the first visible series
                      const timestamp = label;
                      const visibleSeries = chartData.find(s =>
                        visibleASMs.includes(s.asm) &&
                        s.data.some(p => p.time === timestamp)
                      );

                      if (!visibleSeries) return null;

                      // Get the exact data point
                      const dataPoint = visibleSeries.data.find(p => p.time === timestamp);
                      if (!dataPoint) return null;

                      // Get values for all visible ASMs at this exact timestamp
                      const values = chartData
                        .filter(s => visibleASMs.includes(s.asm))
                        .map(s => {
                          const point = s.data.find(p => p.time === timestamp);
                          return {
                            name: s.asm,
                            value: point ? point[s.asm] : null,
                            color: getAsmColor(s.asm)
                          };
                        })
                        .filter(entry => entry.value != null)
                        .sort((a, b) => {
                          if (a.name === 'Total') return -1;
                          if (b.name === 'Total') return 1;
                          return 0;
                        });

                      return (
                        <div className="custom-tooltip">
                          <p className="tooltip-time">{new Date(timestamp).toLocaleString()}</p>
                          {values.map(entry => (
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
                        activeDot={false}
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
              .map(([asmName, params]) => (
                <div
                  key={asmName}
                  className="asm-params-group"
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
                      onChange={e => {
                        const value = parseFloat(e.target.value);
                        // First update the state
                        setFormState(prev => ({
                          ...prev,
                          asmParameters: {
                            ...prev.asmParameters,
                            [asmName]: {
                              ...prev.asmParameters[asmName],
                              halfLife: e.target.value
                            }
                          }
                        }));

                        // Update styling immediately, but no warning
                        if (!value || value <= 0) {
                          e.target.style.border = invalidInputStyle.border;
                          e.target.style.backgroundColor = invalidInputStyle.backgroundColor;
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-half-life`]: true
                          }));
                        } else {
                          e.target.style.border = '';
                          e.target.style.backgroundColor = '';
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-half-life`]: false
                          }));
                        }
                      }}
                      onBlur={e => {
                        const value = parseFloat(e.target.value);
                        if (!value || value <= 0) {
                          setTimeout(() => {
                            alert('You must set a value greater than 0.');
                          }, 0);
                        }
                      }}
                      style={parameterErrors[`${asmName}-half-life`] ? invalidInputStyle : {}}
                      required
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
                      onChange={e => {
                        const value = parseFloat(e.target.value);
                        // First update the state
                        setFormState(prev => ({
                          ...prev,
                          asmParameters: {
                            ...prev.asmParameters,
                            [asmName]: {
                              ...prev.asmParameters[asmName],
                              vd: e.target.value
                            }
                          }
                        }));

                        // Update styling immediately, but no warning
                        if (!value || value <= 0) {
                          e.target.style.border = invalidInputStyle.border;
                          e.target.style.backgroundColor = invalidInputStyle.backgroundColor;
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-vd`]: true
                          }));
                        } else {
                          e.target.style.border = '';
                          e.target.style.backgroundColor = '';
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-vd`]: false
                          }));
                        }
                      }}
                      onBlur={e => {
                        const value = parseFloat(e.target.value);
                        if (!value || value <= 0) {
                          setTimeout(() => {
                            alert('You must set a value greater than 0.');
                          }, 0);
                        }
                      }}
                      style={parameterErrors[`${asmName}-vd`] ? invalidInputStyle : {}}
                      required
                    />
                  </label>
                  <label htmlFor={`${asmName}-bioavailability`}>
                    Bioavailability (%):
                    <input
                      id={`${asmName}-bioavailability`}
                      name={`${asmName}-bioavailability`}
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(params.bioavailability * 100)}
                      onChange={e => {
                        const value = parseInt(e.target.value, 10);
                        // First update the state, keeping as percentage
                        setFormState(prev => ({
                          ...prev,
                          asmParameters: {
                            ...prev.asmParameters,
                            [asmName]: {
                              ...prev.asmParameters[asmName],
                              bioavailability: value / 100 // Convert to proportion only when storing
                            }
                          }
                        }));

                        // Update styling immediately, but no warning
                        if (!value || value <= 0 || value > 100) {
                          e.target.style.border = invalidInputStyle.border;
                          e.target.style.backgroundColor = invalidInputStyle.backgroundColor;
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-bioavailability`]: true
                          }));
                        } else {
                          e.target.style.border = '';
                          e.target.style.backgroundColor = '';
                          setParameterErrors(prev => ({
                            ...prev,
                            [`${asmName}-bioavailability`]: false
                          }));
                        }
                      }}
                      onBlur={e => {
                        const value = parseInt(e.target.value, 10);
                        if (!value || value <= 0 || value > 100) {
                          setTimeout(() => {
                            alert('You must set a value between 0 and 100.');
                          }, 0);
                        }
                      }}
                      style={parameterErrors[`${asmName}-bioavailability`] ? invalidInputStyle : {}}
                      required
                    />
                  </label>
                </div>
              ))}
            {Object.keys(formState.asmParameters).length === 0 && (
              <p className="no-data">Add an ASM above to view and edit parameters</p>
            )}
          </div>
        </div>
      </form>

      {editingDefaults && (
        <EditDefaultsPopup
          asm={editingDefaults}
          onSave={(form) => {
            setFormState(prev => ({
              ...prev,
              asmParameters: {
                ...prev.asmParameters,
                [editingDefaults]: {
                  ...prev.asmParameters[editingDefaults],
                  defaultDosage: Number(form.dosage),
                  defaultUnit: form.unit
                }
              }
            }));
            setEditingDefaults(null);
          }}
          onCancel={() => setEditingDefaults(null)}
        />
      )}
    </div>
  );
}

export default App;