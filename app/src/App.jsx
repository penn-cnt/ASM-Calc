import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'
import { DEFAULT_ASM_TEMPLATE, availableAsms } from './config/asm-defaults'

const ASM_COLORS_KEY = 'asmColors';
const VISIBLE_ASMS_KEY = 'visibleAsms';
const ASM_COLOR_ORDER_KEY = 'asmColorOrder';

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
      // First time load - start with empty state
      const defaultState = {
        weight: 70,
        asmParameters: {},
        medicationHistory: [],
        visibleASMs: ['Total']  // Include Total by default
      };
      return defaultState;
    }

    const parsedState = JSON.parse(savedState);

    // Load saved visible ASMs
    const savedVisibleASMs = localStorage.getItem(VISIBLE_ASMS_KEY);
    // If no saved visible ASMs, include all ASMs plus Total
    const visibleASMs = savedVisibleASMs
      ? JSON.parse(savedVisibleASMs)
      : [...Object.keys(parsedState.asmParameters || {}), 'Total'];

    // Return combined state
    return {
      weight: parsedState.weight || 70,
      asmParameters: parsedState.asmParameters || {},
      medicationHistory: parsedState.medicationHistory || [],
      visibleASMs
    };
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return {
      weight: 70,
      asmParameters: {},
      medicationHistory: [],
      visibleASMs: ['Total']  // Include Total in default state
    };
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
        asmParameters: {},  // Start with empty parameters
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

  const [showCustomInput, setShowCustomInput] = useState(false);

  // Add a new ref for the custom input
  const customAsmInputRef = useRef(null);

  // Update color order state initialization to load from localStorage
  const [asmColorOrder, setAsmColorOrder] = useState(() => {
    const savedOrder = localStorage.getItem(ASM_COLOR_ORDER_KEY);
    if (savedOrder) {
      return JSON.parse(savedOrder);
    }
    const savedState = loadFromLocalStorage();
    return savedState.visibleASMs;
  });

  // Save color order when it changes
  useEffect(() => {
    localStorage.setItem(ASM_COLOR_ORDER_KEY, JSON.stringify(asmColorOrder));
  }, [asmColorOrder]);

  useEffect(() => {
    try {
      localStorage.setItem('formState', JSON.stringify(formState));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [formState]);

  // Save visibleASMs
  useEffect(() => {
    localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify(visibleASMs));
  }, [visibleASMs]);

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
          return;
        }

        // Process parameters to handle half-life ranges
        const processedParameters = Object.entries(formState.asmParameters).reduce((acc, [name, params]) => {
          const halfLife = typeof params.halfLife === 'object'
            ? (params.halfLife.min + params.halfLife.max) / 2  // Use average for min/max
            : params.halfLife;  // Use single value directly

          return {
            ...acc,
            [name]: {
              ...params,
              halfLife
            }
          };
        }, {});

        const response = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_weight: formState.weight,
            medications: formState.medicationHistory,
            asm_parameters: processedParameters,  // Use processed parameters
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

        // Add Total to visible ASMs if multiple ASMs have data and no saved preferences
        const asmsWithData = series.filter(s => s.asm !== 'Total').length;
        const savedVisibleASMs = localStorage.getItem(VISIBLE_ASMS_KEY);
        if (asmsWithData >= 2 && !savedVisibleASMs) {
          const newVisibleASMs = [...visibleASMs];
          if (!newVisibleASMs.includes('Total')) {
            newVisibleASMs.push('Total');
          }
          setVisibleASMs(newVisibleASMs);
          localStorage.setItem(VISIBLE_ASMS_KEY, JSON.stringify(newVisibleASMs));
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

  const getAsmColor = (asmType) => {
    if (asmType === 'Total') {
      return TOTAL_COLOR;
    }
    // Get index from color order array instead of visibleASMs
    const index = asmColorOrder.indexOf(asmType);
    // Use index + 1 since first color is for Total
    return CHART_COLORS[index + 1] || CHART_COLORS[1 + (index % (CHART_COLORS.length - 1))];
  };

  const handleAddCustomAsm = () => {
    if (!newAsmName) {
      alert('Please select an ASM or create a custom one.');
      newAsmInputRef.current?.focus();
      return;
    }

    if (formState.asmParameters[newAsmName]) {
      alert('An ASM with this name already exists.');
      return;
    }

    // Get default parameters
    const defaultParams = availableAsms[newAsmName] || DEFAULT_ASM_TEMPLATE;

    // If half-life is a range, use the average
    const halfLife = defaultParams.halfLife?.min !== undefined
      ? (defaultParams.halfLife.min + defaultParams.halfLife.max) / 2
      : defaultParams.halfLife;

    // Add new ASM to parameters
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [newAsmName]: {
          ...defaultParams,
          halfLife,  // Use the calculated or direct half-life value
          defaultDosage: 200,
          defaultUnit: 'mg',
          isCollapsed: false
        }
      }
    }));

    const newColorOrder = [...asmColorOrder, newAsmName];
    setAsmColorOrder(newColorOrder);
    localStorage.setItem(ASM_COLOR_ORDER_KEY, JSON.stringify(newColorOrder));

    setNewAsmName('');
    setShowAddAsmForm(false);
    setShowCustomInput(false);
  };

  // Update handleDeleteASM
  const handleDeleteASM = (asmName) => {
    if (!confirm(`Are you sure you want to delete ${asmName}? This will remove all doses and parameters associated with it.`)) {
      return;
    }

    const { [asmName]: _, ...remainingAsms } = formState.asmParameters;
    setFormState(prev => ({
      ...prev,
      asmParameters: remainingAsms,
      medicationHistory: prev.medicationHistory.filter(med => med.asmType !== asmName)
    }));

    setVisibleASMs(prev => prev.filter(asm => asm !== asmName));
    const newColorOrder = asmColorOrder.filter(asm => asm !== asmName);
    setAsmColorOrder(newColorOrder);
    localStorage.setItem(ASM_COLOR_ORDER_KEY, JSON.stringify(newColorOrder));
  };

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

  // Helper function to check if any active ASMs are non-linear
  const hasNonLinearAsms = Object.values(formState.asmParameters).some(params => params.nonLinear);

  const downloadParametersCSV = () => {
    if (Object.keys(formState.asmParameters).length === 0) return;

    // Create headers
    const headers = ['ASM', 'Half Life (hours)', 'Volume Distribution (L/kg)', 'Bioavailability (%)'];

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...Object.entries(formState.asmParameters).map(([asmName, params]) => {
        return [
          asmName,
          params.halfLife.toString(),  // Just use the current value directly
          params.vd.toFixed(2),
          (params.bioavailability * 100).toFixed(0)
        ].join(',');
      })
    ].join('\n');

    // Create and trigger download
    const timestamp = new Date().toLocaleString('sv').replace(' ', '_').replace(/:/g, '-');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `asm_parameters_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Update handleHalfLifeChange to store average for range values
  const handleHalfLifeChange = (e, asmName) => {
    const value = parseFloat(e.target.value);
    const params = formState.asmParameters[asmName];

    // If the current parameter has a min/max range in availableAsms, use the average
    if (availableAsms[asmName]?.halfLife?.min !== undefined) {
      const avgHalfLife = (availableAsms[asmName].halfLife.min + availableAsms[asmName].halfLife.max) / 2;
      setFormState(prev => ({
        ...prev,
        asmParameters: {
          ...prev.asmParameters,
          [asmName]: {
            ...prev.asmParameters[asmName],
            halfLife: avgHalfLife
          }
        }
      }));
    } else {
      // For single values, store directly
      setFormState(prev => ({
        ...prev,
        asmParameters: {
          ...prev.asmParameters,
          [asmName]: {
            ...prev.asmParameters[asmName],
            halfLife: value
          }
        }
      }));
    }
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
                min="0"
                step="0.1"
                value={Number(formState.weight).toFixed(1)}
                onChange={e => {
                  const value = parseFloat(e.target.value);
                  setFormState({
                    ...formState,
                    weight: value
                  });

                  // Update styling immediately
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
                  const value = parseFloat(e.target.value);
                  if (!value || value <= 0) {
                    setTimeout(() => {
                      alert('Weight must be greater than 0.');
                    }, 0);
                  }
                }}
                required
                style={weightError ? invalidInputStyle : {}}
              />
            </label>

            <div className="asm-toggle-group">
              <h3>Active ASMs</h3>
              <div className="active-asms">
                {Object.entries(formState.asmParameters).map(([asmName, params]) => (
                  <div
                    key={asmName}
                    className="asm-checkbox"
                    style={{
                      '--checkbox-color': getAsmColor(asmName),
                      color: getAsmColor(asmName),
                      backgroundColor: `${getAsmColor(asmName)}15`,
                      borderLeft: `4px solid ${getAsmColor(asmName)}`,
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
                      {asmName}{params.nonLinear ? '*' : ''}
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
                    {showCustomInput ? (
                      <>
                        <input
                          ref={customAsmInputRef}
                          type="text"
                          value={newAsmName}
                          onChange={(e) => setNewAsmName(e.target.value)}
                          placeholder="Enter custom ASM"
                          required
                        />
                      </>
                    ) : (
                      <select
                        ref={newAsmInputRef}
                        value={newAsmName}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setShowCustomInput(true);
                            setNewAsmName('');
                            // Focus the custom input after state updates
                            setTimeout(() => customAsmInputRef.current?.focus(), 0);
                          } else {
                            setNewAsmName(e.target.value);
                          }
                        }}
                        required
                      >
                        <option value="">Select an ASM</option>
                        {Object.entries(availableAsms)
                          .filter(([name]) => !formState.asmParameters[name])
                          .map(([name, params]) => (
                            <option key={name} value={name}>
                              {name}{params.nonLinear ? '*' : ''}
                            </option>
                          ))}
                        <option value="custom">+ Add Custom ASM</option>
                      </select>
                    )}
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
                        setShowCustomInput(false);
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

                {/* Show note only if there are non-linear ASMs */}
                {hasNonLinearAsms && (
                  <div className="asm-note">
                    *This ASM is known to deviate from a first-order model.
                  </div>
                )}
              </div>
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
                            color: getAsmColor(asmType),
                            backgroundColor: `${getAsmColor(asmType)}15`,
                            borderLeft: `4px solid ${getAsmColor(asmType)}`
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
          <div className="section-header">
            <h2>ASM Parameters</h2>
            {Object.keys(formState.asmParameters).length > 0 && (
              <button
                type="button"
                onClick={downloadParametersCSV}
                className="download-csv-btn"
              >
                Download CSV
              </button>
            )}
          </div>
          <div className="asm-parameters-grid">
            {Object.entries(formState.asmParameters)
              .map(([asmName, params]) => (
                <div
                  key={asmName}
                  className="asm-params-group"
                  style={{
                    backgroundColor: `${getAsmColor(asmName)}08`,
                    borderLeft: `4px solid ${getAsmColor(asmName)}`
                  }}
                >
                  <h3 style={{ color: getAsmColor(asmName) }}>{asmName}</h3>
                  <label htmlFor={`${asmName}-half-life`}>
                    Half-life (hours):
                    <input
                      id={`${asmName}-half-life`}
                      name={`${asmName}-half-life`}
                      type="number"
                      min="0"
                      value={typeof params.halfLife === 'object' ?
                        (params.halfLife.min + params.halfLife.max) / 2 :
                        params.halfLife
                      }
                      onChange={(e) => {
                        handleHalfLifeChange(e, asmName);
                      }}
                      onBlur={e => {
                        const value = parseFloat(e.target.value);
                        if (!value || value <= 0) {
                          setTimeout(() => {
                            alert('Half-life must be greater than 0.');
                          }, 0);
                        }
                      }}
                      required
                      style={parameterErrors[`${asmName}-half-life`] ? invalidInputStyle : {}}
                    />
                  </label>
                  <label htmlFor={`${asmName}-vd`}>
                    Vd (L/kg):
                    <input
                      id={`${asmName}-vd`}
                      name={`${asmName}-vd`}
                      type="number"
                      step="0.1"
                      min="0"
                      value={Number(params.vd).toFixed(1)}
                      onChange={e => {
                        const value = parseFloat(e.target.value);
                        setFormState(prev => ({
                          ...prev,
                          asmParameters: {
                            ...prev.asmParameters,
                            [asmName]: {
                              ...prev.asmParameters[asmName],
                              vd: value
                            }
                          }
                        }));

                        // Update styling immediately
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
                            alert('Volume of distribution must be greater than 0.');
                          }, 0);
                        }
                      }}
                      required
                      style={parameterErrors[`${asmName}-vd`] ? invalidInputStyle : {}}
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
                            alert('Bioavailability must be between 0 and 100.');
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