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

  isUniqueDisplayName: (existingDisplayNames: string[]) => {
    return (input: string): boolean | string => {
      if (existingDisplayNames.includes(input)) {
        return 'A model with this display name already exists. Please choose a different name.';
      }
      return true;
    };
  }
};