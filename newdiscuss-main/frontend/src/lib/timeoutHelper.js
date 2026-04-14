export const withTimeout = (promise, ms = 7000, operationName = 'Firebase operation') => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms);
  });
  
  return Promise.race([
    promise.then(result => {
      clearTimeout(timeoutId);
      return result;
    }).catch(err => {
      clearTimeout(timeoutId);
      throw err;
    }),
    timeoutPromise
  ]);
};
