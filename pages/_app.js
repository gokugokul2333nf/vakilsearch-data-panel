import { Hanken_Grotesk } from 'next/font/google';
import { TipHost } from '../components/ui.js';
import '../styles/globals.css';

const sans = Hanken_Grotesk({ subsets: ['latin'], display: 'swap' });
export default function App({ Component, pageProps }) {
  return <div className={sans.className}><TipHost><Component {...pageProps} /></TipHost></div>;
}
