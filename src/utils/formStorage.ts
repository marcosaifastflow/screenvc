export const getUserFormStorageKey = (userId: string) => `screenvc_form_id:${userId}`;

export const getStoredFormId = (userId: string) => {
  try {
    return localStorage.getItem(getUserFormStorageKey(userId));
  } catch {
    return null;
  }
};

export const setStoredFormId = (userId: string, formId: string) => {
  try {
    localStorage.setItem(getUserFormStorageKey(userId), formId);
  } catch {
    // Ignore storage write errors.
  }
};

export const clearStoredFormId = (userId: string) => {
  try {
    localStorage.removeItem(getUserFormStorageKey(userId));
  } catch {
    // Ignore storage delete errors.
  }
};
