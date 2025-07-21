export const validators = {
  isRequired: (input: string): boolean | string => {
    if (!input || input.trim() === '') {
      return 'This field is required. Please enter a value.';
    }
    return true;
  },

  isValidUrl: (input: string): boolean | string => {
    try {
      new URL(input);
      return true;
    } catch {
      return 'Please enter a valid URL (e.g., https://api.openai.com/v1)';
    }
  },

  isValidApiKey: (input: string): boolean | string => {
    if (!input || input.trim() === '') {
      return 'API key is required.';
    }
    if (input.length < 10) {
      return 'API key seems too short. Please enter a valid API key.';
    }
    return true;
  },

  isValidModelId: (input: string): boolean | string => {
    if (!input || input.trim() === '') {
      return 'Model ID is required.';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
      return 'Model ID can only contain letters, numbers, hyphens, and underscores.';
    }
    return true;
  },

  isValidNumber: (min?: number, max?: number) => {
    return (input: string): boolean | string => {
      const num = parseInt(input, 10);
      if (isNaN(num)) {
        return 'Please enter a valid number.';
      }
      if (min !== undefined && num < min) {
        return `Value must be at least ${min}.`;
      }
      if (max !== undefined && num > max) {
        return `Value must be at most ${max}.`;
      }
      return true;
    };
  },

  isValidTemperatureRange: (input: string): boolean | string => {
    const parts = input.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      return 'Please enter two numbers separated by a comma (e.g., 0, 2)';
    }
    
    const min = parseFloat(parts[0]);
    const max = parseFloat(parts[1]);
    
    if (isNaN(min) || isNaN(max)) {
      return 'Both values must be valid numbers.';
    }
    
    if (min < 0 || max > 2 || min >= max) {
      return 'Range must be between 0 and 2, with min < max.';
    }
    
    return true;
  },

  isUniqueModelId: (existingIds: string[]) => {
    return (input: string): boolean | string => {
      if (existingIds.includes(input)) {
        return 'A model with this ID already exists. Please choose a different ID.';
      }
      return true;
    };
  },

  isValidPrice: (input: string): boolean | string => {
    const price = parseFloat(input);
    if (isNaN(price) || price < 0) {
      return 'Please enter a valid non-negative price (e.g., 0.003)';
    }
    return true;
  }
};