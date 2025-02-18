// Add validation for half-life input based on format
const validateHalfLife = (value, format) => {
  if (format === 'range') {
    return value.min > 0 && value.max > value.min;
  }
  return value > 0;
};

// Update half-life input handling
const handleHalfLifeChange = (e, asmName) => {
  const params = formState.asmParameters[asmName];
  const value = e.target.value;
  
  if (typeof params.halfLife === 'object') {
    // Handle min/max format
    const [field] = e.target.name.split('-').slice(-1);
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [asmName]: {
          ...prev.asmParameters[asmName],
          halfLife: {
            ...prev.asmParameters[asmName].halfLife,
            [field]: parseFloat(value)
          }
        }
      }
    }));
  } else {
    // Handle single value format
    setFormState(prev => ({
      ...prev,
      asmParameters: {
        ...prev.asmParameters,
        [asmName]: {
          ...prev.asmParameters[asmName],
          halfLife: parseFloat(value)
        }
      }
    }));
  }
}; 