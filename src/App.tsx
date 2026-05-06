/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Timer, 
  Trash2, 
  AlertTriangle, 
  MessageSquare, 
  Smartphone, 
  Search, 
  Zap, 
  Ghost, 
  Home, 
  WashingMachine as Laundry, 
  UtensilsCrossed as Sink,
  User,
  Volume2,
  Gamepad2,
  FileText,
  Milk,
  Wind
} from 'lucide-react';

// --- Constants ---
const GAME_DURATION = 180; // 3 minutes in seconds
const ROOM_WIDTH = 400;
const ROOM_HEIGHT = 450;
const PLAYER_SIZE = 50;
const PLAYER_SPEED = 4.5;

type GameState = 'MENU' | 'PLAYING' | 'INSPECTION';
type RoomType = 'Bedroom' | 'Living Room' | 'Kitchen';

interface Mess {
  id: string;
  type: string;
  emoji: string;
  x: number;
  y: number;
  room: RoomType;
  state: 'dirty' | 'hidden' | 'cleaned';
  targetRoom?: RoomType;
  targetId?: string; // e.g. "bin", "sink", "laundry"
  penalty: number;
  suspicionAdd: number;
  label: string;
}

const ROOMS: RoomType[] = ['Bedroom', 'Living Room', 'Kitchen'];

const AI_MESSAGES = [
  "I've detected a high concentration of lazy energy.",
  "Mom's heart rate is normal. For now.",
  "You missed a spot. In your soul.",
  "Perhaps you should have studied instead of gaming.",
  "Slipper probability: 98.4%",
  "According to my analysis, you are cooked.",
  "Cleaning the kitchen first is 'optimal'. Trust me.",
  "Skill issue detected.",
  "I'm notifying the local authorities of your mess.",
  "Why is there Milo on the ceiling?",
];

const MOM_TEXTS = [
  "I'm leaving the mall now.",
  "Did you defrost the chicken?",
  "I hope the house is clean.",
  "Traffic is light today!",
  "I'm turning into our street.",
  "I see your bedroom light on...",
];

// --- Sub-components ---

const Meter = ({ label, value, max, color, icon: Icon }: { label: string, value: number, max: number, color: string, icon: any }) => (
  <div className="flex flex-col gap-1 w-full">
    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/80">
      <div className="flex items-center gap-1">
        <Icon size={14} />
        {label}
      </div>
      <span>{Math.round(value)}%</span>
    </div>
    <div className="h-4 bg-black/40 rounded-full border-2 border-white/20 overflow-hidden relative">
      <motion.div 
        className={`h-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${(value / max) * 100}%` }}
        transition={{ type: 'spring', stiffness: 100 }}
      />
    </div>
  </div>
);

export default function App() {
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [timer, setTimer] = useState(GAME_DURATION);
  const [player, setPlayer] = useState({ x: 200, y: 300, roomIndex: 1 });
  const [messes, setMesses] = useState<Mess[]>([]);
  const [suspicion, setSuspicion] = useState(0);
  const [rage, setRage] = useState(0);
  const [aiChat, setAiChat] = useState<string[]>(["System Online. Prepare for arrival... or clean up."]);
  const [momNotif, setMomNotif] = useState<string | null>(null);
  const [phoneCall, setPhoneCall] = useState<any>(null);
  const [inventory, setInventory] = useState<Mess | null>(null);
  const [score, setScore] = useState(0);
  const [isSprinting, setIsSprinting] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const gameLoopRef = useRef<number | null>(null);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const audioCtx = useRef<AudioContext | null>(null);

  // --- Audio ---
  const playSound = (freq: number, type: OscillatorType = 'square', duration = 0.1) => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.current.destination);
      osc.start();
      osc.stop(audioCtx.current.currentTime + duration);
    } catch (e) { /* Audio blocked */ }
  };

  // --- Game Logic ---

  const initMesses = useCallback(() => {
    const initialMesses: Mess[] = [
      { id: '1', type: 'dish', emoji: '🍽️', x: 50, y: 100, room: 'Kitchen', state: 'dirty', targetId: 'sink', penalty: 15, suspicionAdd: 5, label: 'Dirty Plate' },
      { id: '2', type: 'dish', emoji: '🥣', x: 150, y: 120, room: 'Living Room', state: 'dirty', targetId: 'sink', penalty: 15, suspicionAdd: 5, label: 'Dirty Bowl' },
      { id: '3', type: 'wrapper', emoji: '🍫', x: 200, y: 200, room: 'Living Room', state: 'dirty', targetId: 'bin', penalty: 10, suspicionAdd: 3, label: 'Snack Wrapper' },
      { id: '4', type: 'clothes', emoji: '👕', x: 100, y: 300, room: 'Bedroom', state: 'dirty', targetId: 'laundry', penalty: 12, suspicionAdd: 4, label: 'Smelly Shirt' },
      { id: '5', type: 'clothes', emoji: '🧦', x: 300, y: 350, room: 'Bedroom', state: 'dirty', targetId: 'laundry', penalty: 8, suspicionAdd: 2, label: 'Crusty Sock' },
      { id: '6', type: 'gaming', emoji: '🎮', x: 250, y: 250, room: 'Living Room', state: 'dirty', targetId: 'hidden', penalty: 20, suspicionAdd: 15, label: 'Gaming Controller' },
      { id: '7', type: 'exam', emoji: '📄', x: 50, y: 400, room: 'Bedroom', state: 'dirty', targetId: 'hidden', penalty: 40, suspicionAdd: 25, label: 'Failed Math Exam' },
      { id: '8', type: 'spill', emoji: '🧋', x: 300, y: 150, room: 'Kitchen', state: 'dirty', targetId: 'mop', penalty: 18, suspicionAdd: 8, label: 'Spilled Milo' },
      { id: '9', type: 'vase', emoji: '🏺', x: 100, y: 50, room: 'Living Room', state: 'dirty', targetId: 'bin', penalty: 25, suspicionAdd: 10, label: 'Broken Vase' },
      { id: '10', type: 'trash', emoji: '🥡', x: 200, y: 350, room: 'Kitchen', state: 'dirty', targetId: 'bin', penalty: 15, suspicionAdd: 6, label: 'Takeout Box' },
    ];
    setMesses(initialMesses);
  }, []);

  const startGame = () => {
    setGameState('PLAYING');
    setTimer(GAME_DURATION);
    setSuspicion(0);
    setRage(0);
    setScore(0);
    setInventory(null);
    setAiChat(["System Online. Prepare for arrival... or clean up."]);
    initMesses();
  };

  const handleKeyDown = (e: KeyboardEvent) => { keysPressed.current[e.key.toLowerCase()] = true; };
  const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.key.toLowerCase()] = false; };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const triggerPhoneCall = useCallback(() => {
    if (gameState !== 'PLAYING' || phoneCall) return;
    const calls = [
      {
        title: "I'm almost at the intersection. You better not be gaming.",
        options: [
          { label: "\"I'm studying!\"", response: 'study', color: 'bg-emerald-500 hover:bg-emerald-400' },
          { label: "\"I'm cleaning!\"", response: 'clean', color: 'bg-blue-500 hover:bg-blue-400' },
          { label: "\"I'm sleeping...\"", response: 'sleep', color: 'bg-neutral-600 hover:bg-neutral-500' },
          { label: "\"Nothing.\"", response: 'nothing', color: 'bg-rose-500 hover:bg-rose-400' },
        ]
      },
      {
        title: "Your sister said you made a huge mess. Is this true?",
        options: [
          { label: "\"She's lying!\"", response: 'lie', color: 'bg-emerald-500 hover:bg-emerald-400' },
          { label: "\"It was her!\"", response: 'blame', color: 'bg-blue-500 hover:bg-blue-400' },
          { label: "\"Just a little...\"", response: 'truth', color: 'bg-amber-500 hover:bg-amber-400' },
          { label: "*hang up*", response: 'hangup', color: 'bg-rose-500 hover:bg-rose-400' },
        ]
      },
      {
        title: "Did you take the chicken out of the freezer?",
        options: [
          { label: "\"Yes!\"", response: 'yes_chicken', color: 'bg-emerald-500 hover:bg-emerald-400' },
          { label: "\"Wait, what chicken?\"", response: 'no_chicken', color: 'bg-rose-500 hover:bg-rose-400' },
          { label: "\"I'm a vegan now!\"", response: 'vegan', color: 'bg-blue-500 hover:bg-blue-400' },
          { label: "\"I'll do it right now!\"", response: 'later_chicken', color: 'bg-amber-500 hover:bg-amber-400' }
        ]
      }
    ];
    setPhoneCall(calls[Math.floor(Math.random() * calls.length)]);
    setAiChat(prev => ["PHONE CALL: MOM. Answer it. Now.", ...prev]);
  }, [gameState, phoneCall]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    if (suspicion >= 100) {
      setGameOverReason("MOM ARRIVED EARLY! YOU WERE CAUGHT RED-HANDED.");
      setGameState('INSPECTION');
      playSound(150, 'sawtooth', 0.5);
      return;
    }

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 0) {
          setGameState('INSPECTION');
          return 0;
        }
        return prev - 1;
      });

      // Random AI Messages
      if (Math.random() < 0.05) {
        setAiChat(prev => [AI_MESSAGES[Math.floor(Math.random() * AI_MESSAGES.length)], ...prev].slice(0, 10));
        setRage(r => Math.min(100, r + 2));
      }

      // Random Mom Texts / Calls
      const rand = Math.random();
      if (rand < 0.02) {
        setMomNotif(MOM_TEXTS[Math.floor(Math.random() * MOM_TEXTS.length)]);
        setSuspicion(s => Math.min(100, s + 5));
        setTimeout(() => setMomNotif(null), 4000);
      } else if (rand < 0.05 && timer < 160 && timer > 30) {
        triggerPhoneCall();
      }

      // Random Disasters
      if (Math.random() < 0.02) {
        triggerDisaster();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, timer, triggerPhoneCall]);

  const handlePhoneResponse = (choice: string) => {
    switch (choice) {
      case 'study':
        setSuspicion(s => Math.max(0, s - 15));
        setAiChat(prev => ["Deception successful. Mom thinks you are a nerd.", ...prev]);
        break;
      case 'clean':
        setSuspicion(s => Math.min(100, s + 10));
        setAiChat(prev => ["Who says they are cleaning? Rookie mistake.", ...prev]);
        break;
      case 'sleep':
        setSuspicion(s => Math.min(100, s + 20));
        setRage(r => Math.min(100, r + 10));
        setAiChat(prev => ["Sleeping mid-crisis? A bold move.", ...prev]);
        break;
      case 'nothing':
        setSuspicion(s => Math.min(100, s + 30));
        setAiChat(prev => ["Silence is suspiciously golden.", ...prev]);
        break;
      case 'lie':
        setSuspicion(s => Math.min(100, s + 25));
        setAiChat(prev => ["She knows you're lying. Trust me.", ...prev]);
        break;
      case 'blame':
        setSuspicion(s => Math.max(0, s - 5));
        setRage(r => Math.min(100, r + 15));
        setAiChat(prev => ["Blaming the sibling. Classic. Rage increased.", ...prev]);
        break;
      case 'truth':
        setSuspicion(s => Math.max(0, s - 10));
        setAiChat(prev => ["Honesty? In this economy?", ...prev]);
        break;
      case 'hangup':
        setSuspicion(s => Math.min(100, s + 40));
        setAiChat(prev => ["You hung up on Mom?! YOU ARE INSANE.", ...prev]);
        break;
      case 'yes_chicken':
        setSuspicion(s => Math.max(0, s - 10));
        setAiChat(prev => ["A harmless lie to buy time.", ...prev]);
        break;
      case 'no_chicken':
        setSuspicion(s => Math.min(100, s + 15));
        setRage(r => Math.min(100, r + 10));
        setAiChat(prev => ["Mom's dinner plans are ruined. Godspeed.", ...prev]);
        break;
      case 'vegan':
        setSuspicion(s => Math.min(100, s + 20));
        setAiChat(prev => ["Since when? Suspicious.", ...prev]);
        break;
      case 'later_chicken':
        setSuspicion(s => Math.min(100, s + 5));
        setAiChat(prev => ["Procrastination. Typical.", ...prev]);
        break;
    }
    setPhoneCall(null);
  };

  const triggerDisaster = () => {
    const disasters = [
      { msg: "Sibling spilled more Milo!", type: 'spill', emoji: '🧋', room: 'Living Room' },
      { msg: "Cat knocked over a lamp!", type: 'trash', emoji: '💡', room: 'Bedroom' },
      { msg: "Trash bag tore!", type: 'trash', emoji: '🗑️', room: 'Kitchen' }
    ];
    const d = disasters[Math.floor(Math.random() * disasters.length)];
    setAiChat(prev => [`ALERT: ${d.msg}`, ...prev]);
    setMesses(prev => [
      ...prev,
      { 
        id: Math.random().toString(), 
        type: d.type, 
        emoji: d.emoji, 
        x: Math.random() * (ROOM_WIDTH - 50), 
        y: Math.random() * (ROOM_HEIGHT - 50), 
        room: d.room as RoomType, 
        state: 'dirty', 
        targetId: 'bin', 
        penalty: 15, 
        suspicionAdd: 10, 
        label: d.msg 
      }
    ]);
    setRage(r => Math.min(100, r + 15));
  };

  const updatePlayer = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    setPlayer((p) => {
      let dx = 0;
      let dy = 0;
      const sprinting = !!keysPressed.current['shift'];
      setIsSprinting(sprinting);
      
      const currentSpeed = sprinting ? PLAYER_SPEED * 1.8 : PLAYER_SPEED;
      
      if (keysPressed.current['w'] || keysPressed.current['arrowup']) dy -= currentSpeed;
      if (keysPressed.current['s'] || keysPressed.current['arrowdown']) dy += currentSpeed;
      if (keysPressed.current['a'] || keysPressed.current['arrowleft']) dx -= currentSpeed;
      if (keysPressed.current['d'] || keysPressed.current['arrowright']) dx += currentSpeed;

      // Rage makes movement slippery
      const slip = (rage / 100) * 2;
      let nx = p.x + dx + (Math.random() * slip - slip/2);
      let ny = p.y + dy + (Math.random() * slip - slip/2);
      let nr = p.roomIndex;

      // Penalties for sprinting
      if (sprinting && (dx !== 0 || dy !== 0)) {
        if (Math.random() < 0.1) {
          setRage(r => Math.min(100, r + 0.5));
          setSuspicion(s => Math.min(100, s + 0.2));
        }
      }

      // Handle room transitions
      if (nx < 0) {
        if (nr > 0) {
          nr -= 1;
          nx = ROOM_WIDTH - PLAYER_SIZE;
        } else {
          nx = 0;
        }
      } else if (nx > ROOM_WIDTH - PLAYER_SIZE) {
        if (nr < ROOMS.length - 1) {
          nr += 1;
          nx = 0;
        } else {
          nx = ROOM_WIDTH - PLAYER_SIZE;
        }
      }

      // Constraints
      ny = Math.max(50, Math.min(ROOM_HEIGHT - PLAYER_SIZE, ny));

      return { x: nx, y: ny, roomIndex: nr };
    });

    gameLoopRef.current = requestAnimationFrame(updatePlayer);
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      gameLoopRef.current = requestAnimationFrame(updatePlayer);
    } else {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, updatePlayer]);

  // --- Interaction ---

  const interact = () => {
    if (gameState !== 'PLAYING') return;

    playSound(440, 'sine', 0.05);
    // 1. Check if near functional items (sink, bin, laundry, hiding spot)
    const curRoom = ROOMS[player.roomIndex];
    const targets = [
      { id: 'sink', room: 'Kitchen', x: 300, y: 80, emoji: '🚰' },
      { id: 'bin', room: 'Kitchen', x: 50, y: 380, emoji: '🗑️' },
      { id: 'laundry', room: 'Bedroom', x: 320, y: 380, emoji: '🧺' },
      { id: 'hidden', room: 'Bedroom', x: 50, y: 80, label: 'Under Bed', emoji: '🛌' },
      { id: 'hidden', room: 'Living Room', x: 200, y: 80, label: 'Behind Sofa', emoji: '🛋️' },
    ];

    const target = targets.find(t => 
      t.room === curRoom && 
      Math.abs(t.x - player.x) < 60 && 
      Math.abs(t.y - player.y) < 60
    );

    if (target && inventory) {
      // Drop inventory item into target
      const match = inventory.targetId === target.id || target.id === 'hidden';
      if (match) {
        playSound(880, 'sine', 0.1);
        setScore(s => s + 50);
        setSuspicion(s => Math.max(0, s - 5));
        setAiChat(prev => ["Object neutralized.", ...prev]);
        setMesses(prev => prev.filter(m => m.id !== inventory.id));
        setInventory(null);
      } else {
        setAiChat(prev => ["Wrong location. My logic is superior.", ...prev]);
        setRage(r => Math.min(100, r + 5));
      }
      return;
    }

    // 2. Check if near mess
    const nearbyMess = messes.find(m => 
      m.room === curRoom && 
      m.state === 'dirty' && 
      Math.abs(m.x - player.x) < 50 && 
      Math.abs(m.y - player.y) < 50
    );

    if (nearbyMess) {
      if (nearbyMess.targetId === 'mop') {
        // Cleaning spills takes time / click
        setScore(s => s + 30);
        setMesses(prev => prev.map(m => m.id === nearbyMess.id ? { ...m, state: 'cleaned' as const } : m));
        setAiChat(prev => ["Surface polished. Still messy though.", ...prev]);
      } else {
        // Pick up item
        if (!inventory) {
          setInventory(nearbyMess);
          setMesses(prev => prev.map(m => m.id === nearbyMess.id ? { ...m, state: 'hidden' as const } : m));
          setAiChat(prev => ["Item retrieved. Try not to drop it.", ...prev]);
        }
      }
    }
  };

  useEffect(() => {
    const handleE = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e') interact();
    };
    window.addEventListener('keydown', handleE);
    return () => window.removeEventListener('keydown', handleE);
  }, [player, inventory, messes, gameState]);

  // --- Calculations ---

  const calculateRank = () => {
    const activeMesses = messes.filter(m => m.state === 'dirty').length;
    const hiddenMesses = messes.filter(m => m.state === 'hidden').length;
    
    // Risk: If suspicion is high, Mom checks under beds/sofas
    let riskPenalty = 0;
    let raided = false;
    if (suspicion > 50 && hiddenMesses > 0) {
      riskPenalty = hiddenMesses * 75;
      raided = true;
    }

    const totalPenalty = messes.reduce((acc, m) => m.state === 'dirty' ? acc + m.penalty : acc, 0);
    const finalScore = score - (suspicion * 3) - (rage * 2) - totalPenalty - riskPenalty;

    if (gameOverReason) return { rank: 'F', msg: gameOverReason };
    if (activeMesses === 0 && suspicion < 5 && hiddenMesses === 0) return { rank: 'S', msg: 'HEAVENLY CHILD. You even cleaned the baseboards. Mom is confused but proud.' };
    if (finalScore > 500) return { rank: 'A', msg: raided ? 'She found your stash, but the house is spotless. You get a pass... this time.' : 'SOLID PERFORMANCE. You are allowed to live another day.' };
    if (finalScore > 200) return { rank: 'B', msg: 'She noticed the "cleaned" room smells like sweat and panic. B-.' };
    if (finalScore > 0) return { rank: 'C', msg: 'THE LECTURE PROTOCOL HAS BEGUN. See you in 4 hours.' };
    if (finalScore > -300) return { rank: 'D', msg: 'THE SLIPPER HAS BEEN EQUIPPED. ACCURACY: 100%. VELOCITY: MACH 1.' };
    return { rank: 'F', msg: 'TOTAL DISASTER. You are cooked. Fried. Rotisseried.' };
  };

  const getActiveMessesCount = () => messes.filter(m => m.state === 'dirty').length;

  return (
    <motion.div 
      initial={false}
      animate={rage > 70 ? { x: [0, -2, 2, -2, 2, 0] } : { x: 0 }}
      transition={{ repeat: Infinity, duration: 0.1 }}
      className="min-h-screen bg-[#1a1a1a] font-sans text-white overflow-hidden flex flex-col select-none"
    >
      
      {/* --- HUD --- */}
      <div className="h-20 bg-black border-b-4 border-white/20 flex items-center px-8 gap-12 z-50">
        <div className="flex flex-col">
          <span className="text-[10px] text-white/50 uppercase font-black tracking-widest">Time Remaining</span>
          <div className={`text-4xl font-black tabular-nums transition-colors ${timer < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
          </div>
        </div>

        <div className="flex-1 max-w-2xl flex gap-8">
          <Meter label="Cleanliness" value={Math.max(0, 100 - (getActiveMessesCount() * 10))} max={100} color="bg-emerald-500" icon={Zap} />
          <Meter label="Suspicion" value={suspicion} max={100} color="bg-amber-500" icon={Search} />
          <Meter label="Room Rage" value={rage} max={100} color="bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.5)]" icon={AlertTriangle} />
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-emerald-400/50 uppercase font-black tracking-widest">Score</span>
          <div className="text-3xl font-black text-emerald-400 leading-none">
            {score.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* --- Game World --- */}
        <div className="flex-1 relative bg-neutral-900 border-r-4 border-white/10 flex items-center justify-center p-8 overflow-hidden">
          
          <div className="relative shadow-2xl overflow-hidden rounded-xl border-4 border-white/5 bg-neutral-800" style={{ width: ROOM_WIDTH, height: ROOM_HEIGHT }}>
            
            {/* Visual background for current room */}
            <div className="absolute inset-0 bg-[#2a2a2a] grid grid-cols-2 opacity-5 pointer-events-none">
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
            </div>

            {/* Room Identifier Overlay */}
            <div className="absolute top-4 left-4 text-xs font-black uppercase tracking-[0.25em] text-white/20 select-none">
              {ROOMS[player.roomIndex]}
            </div>

            {/* Targets / Functional Objects */}
            {ROOMS[player.roomIndex] === 'Kitchen' && (
              <>
                <div title="Sink" className="absolute text-5xl transition-transform hover:scale-110 cursor-help" style={{ left: 300, top: 80 }}>🚰</div>
                <div title="Trash Bin" className="absolute text-5xl transition-transform hover:scale-110 cursor-help" style={{ left: 50, top: 380 }}>🗑️</div>
              </>
            )}
            {ROOMS[player.roomIndex] === 'Bedroom' && (
              <>
                <div title="Bed (Hiding Spot)" className="absolute text-7xl" style={{ left: 20, top: 20 }}>🛌</div>
                <div title="Laundry Basket" className="absolute text-5xl" style={{ left: 320, top: 380 }}>🧺</div>
              </>
            )}
            {ROOMS[player.roomIndex] === 'Living Room' && (
              <>
                <div title="Sofa (Hiding Spot)" className="absolute text-7xl" style={{ left: 160, top: 50 }}>🛋️</div>
              </>
            )}

            {/* Messes */}
            {messes.filter(m => m.room === ROOMS[player.roomIndex] && m.state === 'dirty').map(mess => (
              <motion.div
                key={mess.id}
                layoutId={mess.id}
                className="absolute text-4xl cursor-pointer group"
                style={{ left: mess.x, top: mess.y }}
                whileHover={{ scale: 1.2, rotate: 10 }}
                onClick={() => {
                  // If player is close enough, pick up or clean
                  const dist = Math.sqrt(Math.pow(mess.x - player.x, 2) + Math.pow(mess.y - player.y, 2));
                  if (dist < 100) interact();
                  else setAiChat(prev => ["Too far. My robotic arms don't stretch.", ...prev]);
                }}
              >
                <div className="relative">
                  {mess.emoji}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-[8px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-white/20">
                    {mess.label}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Player */}
            <motion.div 
              className="absolute z-40"
              animate={{ left: player.x, top: player.y }}
              transition={{ type: 'tween', ease: 'linear', duration: 0.05 }}
            >
              <div className="relative group">
                <div className={`w-12 h-12 rounded-full bg-blue-400 border-4 border-white flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(96,165,250,0.5)] ${inventory ? 'animate-bounce' : ''}`}>
                  {inventory ? '😇' : '😊'}
                </div>
                {/* Inventory Indicator */}
                {inventory && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-2xl animate-bounce">
                    {inventory.emoji}
                  </div>
                )}
                {/* Interaction Label */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 uppercase font-bold whitespace-nowrap">
                  WASD: Move | E: Pick/Drop
                </div>
              </div>
            </motion.div>

            {/* Transition indicators */}
            {player.roomIndex > 0 && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-12 bg-white/20 animate-pulse rounded-r-lg"></div>}
            {player.roomIndex < ROOMS.length - 1 && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-12 bg-white/20 animate-pulse rounded-l-lg"></div>}

          </div>

          {/* Room Nav */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/40 p-2 rounded-full border border-white/10">
            {ROOMS.map((room, i) => (
              <div 
                key={room} 
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${player.roomIndex === i ? 'bg-white text-black scale-110 shadow-xl' : 'text-white/40 ring-1 ring-white/10'}`}
              >
                {room[0]}
              </div>
            ))}
          </div>

        </div>

        {/* --- Side Panel (AI Assistant) --- */}
        <div className="w-[350px] bg-neutral-900/50 border-l-4 border-white/5 flex flex-col p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-rose-500 font-black italic tracking-tighter text-xl">
              <div className="p-1 bg-rose-500 text-white rounded">
                <Wind size={18} />
              </div>
              Siri-ish AI (v1.2)
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
          </div>

          <div className="flex-1 bg-black/40 border-2 border-white/5 rounded-xl p-4 overflow-y-auto flex flex-col-reverse gap-4 font-mono text-[11px] scrollbar-thin scrollbar-thumb-white/10">
            <AnimatePresence initial={false}>
              {aiChat.map((msg, i) => (
                <motion.div 
                  key={msg + i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-neutral-800 p-2 rounded border-l-4 border-emerald-500"
                >
                  <span className="text-emerald-500 opacity-60 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  {msg}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-6 pt-6 border-t border-white/5">
            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase mb-2">
              <Smartphone size={12} />
              Recent Notifications
            </div>
            <div className="space-y-3">
              <div className="bg-neutral-800/80 p-3 rounded-lg border border-white/5 flex gap-3">
                <div className="w-8 h-8 rounded-full bg-neutral-700 flex-shrink-0 flex items-center justify-center">
                  👩
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-white/30 truncate">MOM (Incoming Text)</div>
                  <div className="text-xs italic text-white/80 line-clamp-2">"I'm almost at the gate. Hope you aren't gaming..."</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Overlays & Modals --- */}
      
      {/* Mom Text Popup */}
      <AnimatePresence>
        {phoneCall && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#2c3e50] p-8 rounded-[2rem] border-4 border-white/20 shadow-2xl w-full max-w-sm text-center"
            >
              <div className="w-20 h-20 bg-rose-500 rounded-full mx-auto mb-4 flex items-center justify-center animate-bounce">
                <Volume2 size={40} />
              </div>
              <h3 className="text-xl font-black mb-1 uppercase tracking-tighter text-white/50">Incoming Call</h3>
              <div className="text-3xl font-black mb-8 italic">MOM</div>
              
              <div className="text-sm italic text-white/80 mb-6">"{phoneCall.title}"</div>
              <div className="grid grid-cols-1 gap-3">
                {phoneCall.options.map((opt: any, i: number) => (
                  <button key={i} onClick={() => handlePhoneResponse(opt.response)} className={`${opt.color} py-3 rounded-xl font-bold transition-colors`}>{opt.label}</button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {momNotif && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] cursor-pointer"
            onClick={() => setMomNotif(null)}
          >
            <div className="bg-[#128C7E] p-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white/20 min-w-[300px]">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/20 flex items-center justify-center text-3xl">
                👩
              </div>
              <div>
                <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">Mom</div>
                <div className="text-lg font-bold italic leading-tight">{momNotif}</div>
              </div>
              <div className="ml-auto text-white/30">
                <MessageSquare size={20} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Menu Overlay */}
      {gameState === 'MENU' && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <h1 className="text-8xl font-black italic tracking-tighter mb-4 text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              MOM IS <span className="text-rose-600 block sm:inline">COMING HOME</span>
            </h1>
            <p className="text-white/40 font-mono text-lg mb-12 tracking-widest uppercase italic">
              Estimated Arrival: <span className="text-rose-500 animate-pulse">03:00</span>
            </p>
            
            <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
              <button 
                onClick={startGame}
                className="group relative bg-white text-black font-black text-2xl py-6 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_10px_0_#999] hover:shadow-[0_5px_0_#999] hover:translate-y-[5px] active:shadow-none active:translate-y-[10px]"
              >
                START CLEANING
              </button>

              <button 
                onClick={() => setShowTutorial(true)}
                className="mt-4 bg-neutral-800 text-white font-bold text-lg py-4 rounded-xl border-2 border-white/20 hover:bg-neutral-700 transition-colors"
              >
                HOW DOES THIS WORK? (TUTORIAL)
              </button>
              
              <div className="mt-8 grid grid-cols-2 gap-4 text-[11px] font-mono text-white/50 uppercase tracking-tighter text-left bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-white font-bold">WASD</div>
                  Move
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-rose-500 flex items-center justify-center text-white font-bold">E</div>
                  Interact
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-white font-bold">SHIFT</div>
                  Sprint
                </div>
                <div className="flex items-center gap-2 text-[9px] leading-tight">
                   Pick up trash, put in bin. Hide evidence. Don't get caught.
                </div>
              </div>
            </div>
          </motion.div>

          <div className="absolute bottom-12 text-white/20 font-black text-4xl opacity-5 italic tracking-tighter">
            HACKATHON EDITION 2024
          </div>
          
          <AnimatePresence>
            {showTutorial && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="absolute inset-0 z-[250] bg-[#1a1a1a] flex flex-col items-center justify-center p-8 overflow-y-auto"
              >
                <div className="w-full max-w-4xl bg-neutral-900 border-4 border-white/10 rounded-[2rem] p-8 shadow-2xl relative">
                  
                  <button 
                    onClick={() => setShowTutorial(false)}
                    className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center font-bold text-xl transition-colors text-white/50 hover:text-white"
                  >
                    X
                  </button>

                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-8 text-emerald-400">Survival Guide</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xl font-bold uppercase text-white/80 mb-2 border-b border-white/10 pb-2">1. The Premise</h3>
                        <p className="text-white/60 text-sm leading-relaxed">
                          Your mom is exactly 3 minutes away from home (unless she speeds up). The house is a <span className="text-rose-400">complete disaster zone</span>. Your objective is to clean the place up or hide the evidence before she walks through the door.
                        </p>
                      </div>

                      <div>
                        <h3 className="text-xl font-bold uppercase text-white/80 mb-2 border-b border-white/10 pb-2">2. Movements & Mechanics</h3>
                        <ul className="text-white/60 text-sm leading-relaxed space-y-2 list-disc pl-4">
                          <li><strong className="text-white">WASD or Arrows:</strong> Move around the 3 rooms (Bedroom, Living Room, Kitchen). You automatically transition at the edges.</li>
                          <li><strong className="text-white">SHIFT:</strong> Sprint. Warning: Sprinting makes you clumsy and slippery. It slowly builds up <span className="text-amber-500">Suspicion</span> and <span className="text-rose-500">Rage</span> if you bump into things or run too much.</li>
                          <li><strong className="text-white">E or Click:</strong> Interact. Pick up messes, or drop them off at designated cleaning stations.</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-bold uppercase text-white/80 mb-2 border-b border-white/10 pb-2">3. The Three Meters</h3>
                        <ul className="text-white/60 text-sm leading-relaxed space-y-4">
                          <li>
                            <div className="flex items-center gap-2 font-bold text-emerald-400"><Zap size={16}/> Cleanliness</div>
                            Starts low. Increases as you clean objects. If there are dirty objects, it stays low.
                          </li>
                          <li>
                            <div className="flex items-center gap-2 font-bold text-amber-500"><Search size={16}/> Suspicion</div>
                            Mom's "spidey sense". Increases from loud events, bad excuses during phone calls, or running around erratically. If it gets over 50%, she might actively check your hiding spots during Final Inspection!
                          </li>
                          <li>
                            <div className="flex items-center gap-2 font-bold text-rose-500"><AlertTriangle size={16}/> Rage (Room Chaos)</div>
                            The abstract representation of panic. Increases randomly, or when disasters happen (like siblings spilling things), or if you lie poorly. High rage makes movement slippery.
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-6">
                      
                      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                        <h3 className="text-lg font-bold uppercase text-rose-400 mb-2">How to Clean</h3>
                        <p className="text-white/60 text-sm mb-4">Each object has a specific target it belongs to. If you put it in the wrong place, it won't be cleaned and you will panic further!</p>
                        
                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
                            <span>🎮 Gaming Controller</span>
                            <span>➔ 🛋️ Hide Behind Sofa</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
                            <span>🍽️ Dirty Dishes & Bowls</span>
                            <span>➔ 🚰 Kitchen Sink</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
                            <span>👕 Smelly Clothes</span>
                            <span>➔ 🧺 Laundry Basket (Bedroom)</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
                            <span>📄 Failed Exam</span>
                            <span>➔ 🛌 Hide Under Bed (Bedroom)</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded">
                            <span>🥡 Trash/Wrappers/Broken Vase</span>
                            <span>➔ 🗑️ Trash Bin (Kitchen)</span>
                          </div>
                          <div className="flex justify-between items-center border border-dashed border-emerald-500/50 text-emerald-300/80 p-2 rounded mt-2">
                            <span>🧋 Spills</span>
                            <span>➔ Stand next to it and spam 'E' (No need to pick up)</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xl font-bold uppercase text-white/80 mb-2 border-b border-white/10 pb-2">5. Random Events</h3>
                        <p className="text-white/60 text-sm leading-relaxed mb-2">
                          Expect chaos. Siblings will drop things. The cat will knock stuff over. Your useless 'Siri-ish' AI assistant will give you terrible advice. 
                        </p>
                        <p className="text-white/60 text-sm leading-relaxed">
                          <strong className="text-rose-400">Mom is calling:</strong> You will get pop-up phone calls. The timer continues. You must select an excuse quickly. Lying is risky. Truth is painful.
                        </p>
                      </div>

                    </div>
                  </div>
                  
                  <div className="mt-8 text-center border-t border-white/10 pt-8">
                    <button 
                      onClick={() => setShowTutorial(false)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-2xl py-4 px-12 rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_5px_0_#064e3b]"
                    >
                      I UNDERSTAND. LET'S GO.
                    </button>
                    <p className="text-white/30 text-xs uppercase font-bold mt-4 tracking-widest">
                      Failure results in the slipper.
                    </p>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Inspection Modal */}
      {gameState === 'INSPECTION' && (
        <div className="fixed inset-0 z-[300] bg-rose-950/80 backdrop-blur-lg flex items-center justify-center p-8">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            className="bg-white text-black w-full max-w-lg p-12 rounded-[3rem] shadow-[20px_20px_0_rgba(0,0,0,0.5)] border-8 border-black text-center"
          >
            <div className="text-xs font-black uppercase tracking-widest opacity-30 mb-2">Final Inspection Report</div>
            <h2 className="text-5xl font-black mb-8 italic">MOM HAS ARRIVED.</h2>
            
            <div className="flex justify-center mb-8">
              <div className="w-32 h-32 rounded-full border-8 border-black flex items-center justify-center text-7xl font-black bg-rose-500 text-white shadow-xl rotate-12">
                {calculateRank().rank}
              </div>
            </div>

            <div className="space-y-2 mb-12">
              <div className="text-2xl font-black uppercase">{calculateRank().msg}</div>
              <div className="font-mono text-sm opacity-60 italic">
                Active Messes: {getActiveMessesCount()} • 
                Suspicion: {Math.round(suspicion)}% • 
                Rage: {Math.round(rage)}%
              </div>
            </div>

            <button 
              onClick={() => setGameState('MENU')}
              className="bg-black text-white font-black py-4 px-12 rounded-full hover:scale-105 transition-transform"
            >
              RETRY EXECUTION
            </button>
          </motion.div>
        </div>
      )}

    </motion.div>
  );
}
