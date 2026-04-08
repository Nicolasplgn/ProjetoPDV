export const checkRealInternet = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }
  
    try {
      await fetch(`https://1.1.1.1/cdn-cgi/trace?t=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        method: 'GET',
      });
      return true;
    } catch {
      return false;
    }
  };