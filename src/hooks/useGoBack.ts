import { useLocation, useNavigate } from 'react-router-dom';

/** Navigates back in history (restoring the caller's scroll position) when there is
 * somewhere in this session to go back to; falls back to the home page otherwise
 * (e.g. when the tool page was opened directly via a deep link). */
export function useGoBack() {
  const navigate = useNavigate();
  const location = useLocation();

  return () => {
    if (location.key === 'default') {
      navigate('/');
    } else {
      navigate(-1);
    }
  };
}
