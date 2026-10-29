import { useEffect, useState } from 'react';

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
  };
};

const MOBILE_POINTER_QUERY = '(pointer: coarse) and (max-width: 52em)';

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const uaMobile = (navigator as NavigatorWithUAData).userAgentData?.mobile;
  if (uaMobile === true) return true;
  return window.matchMedia(MOBILE_POINTER_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(detectMobile);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_POINTER_QUERY);
    const onChange = () => setIsMobile(detectMobile());
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

