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

  isUniqueModelId: (existingIds: string[]) => {
    return (input: string): boolean | string => {
      if (existingIds.includes(input)) {
        return 'A model with this ID already exists. Please choose a different ID.';
      }
      return true;
    };
  }
};