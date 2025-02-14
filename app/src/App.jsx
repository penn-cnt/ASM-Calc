import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

function App() {
  const [results, setResults] = useState([])
  const [formState, setFormState] = useState({
    weight: 70,
    halfLife: 12,
    vd: 0.7,
    bioavailability: 0.8,
    medicationHistory: []
  })

  const calculateConcentrations = async (e) => {
    e.preventDefault()
    try {
      // Validate medication history
      if (!formState.medicationHistory || formState.medicationHistory.length === 0) {
        throw new Error("Please add at least one medication dose")
      }

      // Convert all doses to mg before sending
      const convertToMg = (value, unit) => {
        switch (unit) {
          case 'ug': return value / 1000;
          case 'g': return value * 1000;
          default: return value;
        }
      };

      const requestData = {
        ...formState,
        weight: parseFloat(formState.weight),
        vd: parseFloat(formState.vd),
        medicationHistory: formState.medicationHistory.map(med => ({
          timestamp: med.timestamp,
          dosage: convertToMg(parseFloat(med.dosage), med.unit),
          taken: true
        }))
      }
      console.log('Sending data (stringified):', JSON.stringify(requestData, null, 2))

      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      })

      // Log the raw response
      const responseText = await response.text()
      console.log('Raw response:', responseText)

      // Try to parse as JSON
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText}`)
      }

      if (!response.ok) {
        throw new Error(data.error || 'Calculation failed')
      }

      setResults(data)
    } catch (error) {
      alert(`Error: ${error.message}`)
      console.error('Calculation error:', error)
    }
  }

  const addDose = () => {
    // Get current date-time and format it to ISO string with local timezone offset
    const now = new Date();
    const timeZoneOffset = now.getTimezoneOffset() * 60000; // convert minutes to milliseconds
    const localISOTime = new Date(now - timeZoneOffset).toISOString().slice(0, -1);

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

      <form onSubmit={calculateConcentrations} className="calculator-grid">
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
              <button type="submit" className="calculate-btn">
                Calculate Concentrations
              </button>
            </div>

            {formState.medicationHistory.map((med, index) => (
              <div key={index} className="dose-entry">
                <div className="dose-entry-inputs">
                  <input
                    type="datetime-local"
                    value={med.timestamp.slice(0, 16)}
                    onChange={e => {
                      const newHistory = [...formState.medicationHistory];
                      newHistory[index].timestamp = e.target.value + ':00Z';
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
          {results.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={results}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(time) => new Date(time).toLocaleTimeString()}
                />
                <YAxis label={{ value: 'Concentration (mg/L)', angle: -90 }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="concentration"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Submit calculation to view results</p>
          )}
        </div>
      </form>
    </div>
  )
}

export default App
