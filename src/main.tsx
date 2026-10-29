import { createRoot } from 'react-dom/client';
import HandoffClaim from './components/HandoffClaim';
import HandoffDemo from './components/HandoffDemo';
import './styles.css';

const isClaimRoute = window.location.pathname.startsWith('/handoff');

createRoot(document.getElementById('app')!).render(
  isClaimRoute ? <HandoffClaim /> : <HandoffDemo />
);
