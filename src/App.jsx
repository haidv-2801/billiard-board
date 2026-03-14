import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Plus,
  Minus,
  UserPlus,
  History,
  Trophy,
  Settings,
  ArrowRightLeft,
  Users,
  XCircle,
  Crown,
  Play,
  Trash2,
  ClipboardCopy,
  Check,
  FileText,
  Clock,
  Undo2,
  Edit2,
  RotateCcw,
  ScrollText,
  Share2,
  Send,
} from 'lucide-react';
import {
  saveSession as dbSaveSession,
  getAllSessions as dbGetAllSessions,
  deleteSession as dbDeleteSession,
  saveAllPlayers as dbSaveAllPlayers,
  getAllPlayers as dbGetAllPlayers,
} from './lib/db';

import { Card, Button, Modal } from './components/ui';

// --- Main App ---

// Các loại đền tiền có thể tùy chỉnh
const PENALTY_TYPES = [
  { id: 'basic', name: 'Đền cơ bản', icon: '🎱', defaultAmount: 10 },
  { id: 'food', name: 'Đền ăn', icon: '🍜', defaultAmount: 20 },
  { id: 'drink', name: 'Đền nước', icon: '🥤', defaultAmount: 10 },
  { id: 'break', name: 'Đền mở bóng', icon: '🎱', defaultAmount: 5 },
  { id: 'game', name: 'Đền hết game', icon: '🏆', defaultAmount: 15 },
  { id: 'custom', name: 'Tùy chỉnh', icon: '✏️', defaultAmount: 10 },
];

// Đơn giản: Mỗi khoản đền lưu: ai đền, đền ai, số tiền
// Ví dụ: A đền B 100 → { fromId: A, toId: B, amount: 100 }
// Hiển thị: A: "-100 (đền B)", B: "+100 (A đền)"

export default function App() {
  const SCORE_STEPS = [5, 10, 15, 20];
  const PENALIZE_STEPS = [5, 10, 15, 20];

  // State quản lý Session
  const [session, setSession] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [sets, setSets] = useState([]);
  const [savedSessions, setSavedSessions] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);

  // State cho Set hiện tại
  const [currentSet, setCurrentSet] = useState(null);
  const [showMobileRanking, setShowMobileRanking] = useState(false);

  // UI State
  const [view, setView] = useState('home');
  const [modals, setModals] = useState({
    addPlayer: false,
    penalizeAll: false,
    transfer: false,
    editScore: false,
    endSession: false,
    report: false,
    editPlayer: false,
    editSessionName: false,
    history: false,
    confirmDeleteSet: false,
    telegramSettings: false,
    addPenalty: false,
    setSummary: false,
    editPenalty: false,
    setDetail: false,
  });
  const [telegramConfig, setTelegramConfig] = useState(() => {
    const saved = localStorage.getItem('telegramConfig');
    return saved
      ? JSON.parse(saved)
      : {
          botToken: '8796969661:AAERxVj-rKxH89DFlzQtavBNxTZ9LJreEYY',
          chatId: '-4997017779',
        };
  });
  const [copied, setCopied] = useState(false);
  const [copiedHistory, setCopiedHistory] = useState(false);
  const [toast, setToast] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState(null);
  const [selectedSetDetail, setSelectedSetDetail] = useState(null);
  const [preSelectedPlayers, setPreSelectedPlayers] = useState([]);

  const [tempData, setTempData] = useState({
    playerName: '',
    selectedPlayerId: null,
    targetPlayerId: null,
    transferAmount: 0,
    manualScore: 0,
    penalizeAmount: 0,
    sessionName: new Date().toLocaleDateString('vi-VN'),
    editPlayerName: '',
    editSessionName: '',
    penaltyType: 'basic',
    penaltyAmount: 10,
    penaltyNote: '',
    // For editing existing penalties
    editPenaltyId: null,
    editPenaltyAmount: 0,
    editPenaltyType: 'custom',
  });

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only when in session and has current set
      if (view !== 'session' || !currentSet || !session.players.length) return;

      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;

      const key = e.key;

      // + key: add 1 to first player
      if (key === '=' || key === '+') {
        e.preventDefault();
        if (session.players[0]) updateScore(session.players[0].id, 1);
      }

      // - key: subtract 1 from first player
      if (key === '-') {
        e.preventDefault();
        if (session.players[0]) updateScore(session.players[0].id, -1);
      }

      // z key: undo
      if (key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      }

      // n key: new set
      if (key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (session.players.length >= 2) startNewSet();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, currentSet, session, updateScore, handleUndo, startNewSet]);

  // --- IndexedDB: Load on mount ---
  useEffect(() => {
    dbGetAllSessions()
      .then(setSavedSessions)
      .catch((err) => {
        console.warn('Failed to load sessions from IndexedDB:', err);
      });
    dbGetAllPlayers()
      .then((players) => {
        if (players.length > 0) setAllPlayers(players);
      })
      .catch((err) => {
        console.warn('Failed to load players from IndexedDB:', err);
      });
  }, []);

  // --- IndexedDB: Auto-save session on every change ---
  const saveTimeout = useRef(null);

  const persistSession = useCallback(() => {
    if (!session) return;
    const record = {
      id: session.id,
      name: session.name,
      startTime:
        session.startTime instanceof Date
          ? session.startTime.toISOString()
          : session.startTime,
      players: session.players,
      sets: sets.map((s) => ({
        ...s,
        timestamp:
          s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp,
      })),
      currentSet,
      status: 'active',
    };
    dbSaveSession(record).catch((err) => {
      console.warn('Failed to save session to IndexedDB:', err);
    });
  }, [session, sets, currentSet]);

  useEffect(() => {
    if (!session) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(persistSession, 500);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [session, sets, currentSet, persistSession]);

  // Auto-save players
  useEffect(() => {
    if (allPlayers.length > 0) {
      dbSaveAllPlayers(allPlayers).catch((err) => {
        console.warn('Failed to save players to IndexedDB:', err);
      });
    }
  }, [allPlayers]);

  // Save Telegram config to localStorage
  useEffect(() => {
    localStorage.setItem('telegramConfig', JSON.stringify(telegramConfig));
  }, [telegramConfig]);

  // --- Telegram Notification ---
  const sendTelegramNotification = useCallback(
    async (message) => {
      if (!telegramConfig.botToken || !telegramConfig.chatId) {
        console.warn('Telegram not configured');
        return false;
      }

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramConfig.chatId,
              text: message,
              parse_mode: 'HTML',
            }),
          },
        );
        return response.ok;
      } catch (error) {
        console.error('Failed to send Telegram notification:', error);
        return false;
      }
    },
    [telegramConfig],
  );

  // --- Wake Lock: keep screen on during active set ---
  const wakeLockRef = useRef(null);

  // --- Haptic Feedback ---
  const hapticFeedback = useCallback((type = 'light') => {
    if (!('vibrate' in navigator)) return;

    const patterns = {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [10, 50, 10],
      error: [50, 50],
      selection: 5,
    };

    const pattern = patterns[type] || patterns.light;
    navigator.vibrate(pattern);
  }, []);

  useEffect(() => {
    const requestWakeLock = async () => {
      if (currentSet && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          /* ignore — user denied or not supported */
        }
      } else if (!currentSet && wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    requestWakeLock();

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        currentSet &&
        'wakeLock' in navigator
      ) {
        navigator.wakeLock
          .request('screen')
          .then((lock) => {
            wakeLockRef.current = lock;
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [currentSet]);

  // --- Handlers ---

  const refreshSavedSessions = useCallback(() => {
    dbGetAllSessions()
      .then(setSavedSessions)
      .catch(() => {});
  }, []);

  const createSession = (name) => {
    const newSession = {
      id: Date.now(),
      name: name || 'Phiên chơi ' + new Date().toLocaleDateString('vi-VN'),
      startTime: new Date(),
      players: preSelectedPlayers.length > 0 ? [...preSelectedPlayers] : [],
    };
    setSession(newSession);
    setSets([]);
    setCurrentSet(null);
    setActionHistory([]);
    setPreSelectedPlayers([]);
    setView('session');
  };

  const continueSession = (saved) => {
    setSession({
      id: saved.id,
      name: saved.name,
      startTime: new Date(saved.startTime),
      players: saved.players || [],
    });
    setSets(
      (saved.sets || []).map((s) => ({
        ...s,
        timestamp: new Date(s.timestamp),
      })),
    );
    setCurrentSet(saved.currentSet || null);
    setView('session');
  };

  const deleteSavedSession = async (id) => {
    await dbDeleteSession(id);
    refreshSavedSessions();
  };

  const endSession = async () => {
    // Send Telegram notification before clearing session
    if (
      session &&
      sets.length > 0 &&
      telegramConfig.botToken &&
      telegramConfig.chatId
    ) {
      //setToast({ type: 'info', message: '📨 Đang gửi Telegram...' });
      await sendTelegramNotification(generateTelegramMessage('session'));
      //setToast({ type: 'success', message: '✅ Đã gửi Telegram!' });
      // setTimeout(() => setToast(null), 3000);
    }

    if (session) {
      // Mark session as finished before going home
      const record = {
        id: session.id,
        name: session.name,
        startTime:
          session.startTime instanceof Date
            ? session.startTime.toISOString()
            : session.startTime,
        players: session.players,
        sets: sets.map((s) => ({
          ...s,
          timestamp:
            s.timestamp instanceof Date
              ? s.timestamp.toISOString()
              : s.timestamp,
        })),
        currentSet: null,
        status: 'finished',
        endTime: new Date().toISOString(),
      };
      await dbSaveSession(record).catch(() => {});
    }
    setSession(null);
    setSets([]);
    setCurrentSet(null);
    setModals((prev) => ({ ...prev, endSession: false }));
    refreshSavedSessions();
    setView('home');
  };

  const addPlayerToSession = (name, keepModalOpen = false) => {
    if (!name.trim()) return;
    const newPlayer = { id: Date.now().toString(), name: name.trim() };
    setSession((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));
    hapticFeedback('success');

    // Nếu đang có set hiện tại, thêm điểm 0 cho người chơi mới
    if (currentSet) {
      setCurrentSet((prev) => ({
        ...prev,
        playerPoints: {
          ...prev.playerPoints,
          [newPlayer.id]: 0,
        },
      }));
    }

    setAllPlayers((prev) => {
      if (prev.find((p) => p.name === name.trim())) return prev;
      return [...prev, newPlayer];
    });
    logAction('Thêm người chơi', `${name.trim()} đã được thêm vào`);
    setTempData((prev) => ({ ...prev, playerName: '' }));
    if (!keepModalOpen) {
      setModals((prev) => ({ ...prev, addPlayer: false }));
    }
  };

  function startNewSet() {
    if (session.players.length < 2) return;
    hapticFeedback('heavy');
    const initialPoints = {};
    session.players.forEach((p) => (initialPoints[p.id] = 0));
    setCurrentSet({
      id: sets.length + 1,
      playerPoints: initialPoints,
      penalties: [], // Mảng lưu chi tiết các lần đền
    });
    setUndoStack([]);
    logAction('Bắt đầu set mới', `Set ${sets.length + 1} đã bắt đầu`);
  }

  const pushUndo = () => {
    if (!currentSet) return;
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(currentSet))]);
  };

  const logAction = (action, details = '') => {
    const timestamp = new Date();
    const log = {
      id: Date.now(),
      timestamp,
      action,
      details,
      setId: currentSet?.id || sets.length,
    };
    setActionHistory((prev) => [...prev, log]);
  };

  function handleUndo() {
    if (undoStack.length === 0) return;
    hapticFeedback('light');
    const prev = undoStack[undoStack.length - 1];
    setCurrentSet(prev);
    setUndoStack((stack) => stack.slice(0, -1));
    logAction('Hoàn tác', 'Đã hoàn tác thao tác trước');
  }

  function updateScore(playerId, delta) {
    if (!currentSet) return;
    pushUndo();
    hapticFeedback(delta > 0 ? 'light' : 'medium');
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [playerId]: (prev.playerPoints[playerId] || 0) + delta,
      },
    }));
    const playerName = session.players.find((p) => p.id === playerId)?.name;
    logAction(
      'Cập nhật điểm',
      `${playerName}: ${delta > 0 ? '+' : ''}${delta} điểm`,
    );
  }

  const handleManualScoreChange = () => {
    if (!currentSet || tempData.selectedPlayerId === null) return;
    pushUndo();
    const playerName = session.players.find(
      (p) => p.id === tempData.selectedPlayerId,
    )?.name;
    const oldScore = currentSet.playerPoints[tempData.selectedPlayerId] || 0;
    const newScore = parseInt(tempData.manualScore) || 0;
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [tempData.selectedPlayerId]: newScore,
      },
    }));
    logAction('Chỉnh sửa điểm', `${playerName}: ${oldScore} → ${newScore}`);
    setModals((prev) => ({ ...prev, editScore: false }));
  };

  const handleRenamePlayer = () => {
    if (!tempData.selectedPlayerId || !tempData.editPlayerName.trim()) return;

    // Update trong session
    setSession((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === tempData.selectedPlayerId
          ? { ...p, name: tempData.editPlayerName.trim() }
          : p,
      ),
    }));

    // Update trong allPlayers
    setAllPlayers((prev) =>
      prev.map((p) =>
        p.id === tempData.selectedPlayerId
          ? { ...p, name: tempData.editPlayerName.trim() }
          : p,
      ),
    );

    setModals((prev) => ({ ...prev, editPlayer: false }));
    setTempData((prev) => ({
      ...prev,
      editPlayerName: '',
      selectedPlayerId: null,
    }));
  };

  const handleRenameSession = () => {
    if (!tempData.editSessionName.trim()) return;

    setSession((prev) => ({
      ...prev,
      name: tempData.editSessionName.trim(),
    }));

    setModals((prev) => ({ ...prev, editSessionName: false }));
    setTempData((prev) => ({ ...prev, editSessionName: '' }));
  };

  const handlePenalizeAllAction = () => {
    const winnerId = tempData.selectedPlayerId;
    const amountY = tempData.penalizeAmount;
    if (!currentSet || !winnerId) return;

    pushUndo();
    const newPoints = { ...currentSet.playerPoints };
    const otherPlayersCount = Object.keys(newPoints).length - 1;

    Object.keys(newPoints).forEach((id) => {
      if (id === winnerId) {
        newPoints[id] += otherPlayersCount * amountY;
      } else {
        newPoints[id] -= amountY;
      }
    });

    const winnerName = session.players.find((p) => p.id === winnerId)?.name;
    logAction(
      'Cả làng đền',
      `${winnerName} thắng, mỗi người đền ${amountY} điểm`,
    );
    setCurrentSet((prev) => ({ ...prev, playerPoints: newPoints }));
    setModals((prev) => ({ ...prev, penalizeAll: false }));
    setTempData((prev) => ({
      ...prev,
      selectedPlayerId: null,
      penalizeAmount: 0,
    }));
  };

  const handleTransfer = () => {
    const { selectedPlayerId, targetPlayerId, transferAmount } = tempData;
    if (
      !currentSet ||
      !selectedPlayerId ||
      !targetPlayerId ||
      selectedPlayerId === targetPlayerId ||
      transferAmount === 0
    )
      return;

    pushUndo();
    const fromName = session.players.find(
      (p) => p.id === selectedPlayerId,
    )?.name;
    const toName = session.players.find((p) => p.id === targetPlayerId)?.name;
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [selectedPlayerId]:
          prev.playerPoints[selectedPlayerId] - transferAmount,
        [targetPlayerId]: prev.playerPoints[targetPlayerId] + transferAmount,
      },
    }));
    logAction('X đền Y', `${fromName} đền ${toName} ${transferAmount} điểm`);
    setModals((prev) => ({ ...prev, transfer: false }));
    setTempData((prev) => ({ ...prev, transferAmount: 0 }));
  };

  // Thêm một khoản đền chi tiết
  const addPenalty = (playerId, type, amount, note = '') => {
    if (!currentSet || !playerId || amount === 0) return;

    const penaltyType =
      PENALTY_TYPES.find((t) => t.id === type) || PENALTY_TYPES[0];
    const playerName = session.players.find((p) => p.id === playerId)?.name;

    pushUndo();
    const groupId = Date.now(); // Dùng để xóa cặp đền cùng nhau

    const newPenalty = {
      id: Date.now(),
      groupId, // Để xóa cặp cùng lúc
      playerId,
      playerName,
      typeId: type,
      typeName: penaltyType.name,
      typeIcon: penaltyType.icon,
      amount, // có thể âm (người được đền) hoặc dương (người đền)
      note,
      timestamp: new Date(),
    };

    // amount âm = người được đền (cộng điểm), dương = người đền (trừ điểm)
    const actualAmount = amount > 0 ? -amount : Math.abs(amount);

    setCurrentSet((prev) => ({
      ...prev,
      penalties: [...(prev.penalties || []), newPenalty],
      playerPoints: {
        ...prev.playerPoints,
        [playerId]: (prev.playerPoints[playerId] || 0) + actualAmount,
      },
    }));

    logAction('Thêm đền', `${playerName} ${note ? note : ''}: ${amount} điểm`);
    hapticFeedback('medium');
  };

  // Xóa một khoản đền (xóa cả cặp nếu là đền A-B)
  const removePenalty = (penaltyId) => {
    if (!currentSet) return;
    const penalty = currentSet.penalties?.find((p) => p.id === penaltyId);
    if (!penalty) return;

    pushUndo();

    // Tìm tất cả penalties trong cùng group (cặp đền)
    const groupPenalties =
      currentSet.penalties?.filter((p) => p.groupId === penalty.groupId) || [];

    // Hoàn tác điểm cho tất cả trong group
    const pointsToRestore = {};
    groupPenalties.forEach((p) => {
      // amount âm = đã trừ, cần cộng lại; amount dương = đã cộng, cần trừ đi
      const restoreAmount = p.amount > 0 ? -p.amount : Math.abs(p.amount);
      pointsToRestore[p.playerId] =
        (pointsToRestore[p.playerId] || 0) + restoreAmount;
    });

    setCurrentSet((prev) => ({
      ...prev,
      // Xóa tất cả penalties trong group
      penalties: prev.penalties.filter((p) => p.groupId !== penalty.groupId),
      playerPoints: {
        ...prev.playerPoints,
        ...Object.entries(pointsToRestore).reduce((acc, [pid, amt]) => {
          acc[pid] = (prev.playerPoints[pid] || 0) + amt;
          return acc;
        }, {}),
      },
    }));
    logAction('Xóa đền', `${penalty.note || 'đền'}: ${penalty.amount} điểm`);
  };

  // Chỉnh sửa một khoản đền
  const editPenalty = () => {
    if (!currentSet || !tempData.editPenaltyId) return;

    const oldPenalty = currentSet.penalties?.find(
      (p) => p.id === tempData.editPenaltyId,
    );
    if (!oldPenalty) return;

    pushUndo();

    const groupPenalties =
      currentSet.penalties?.filter((p) => p.groupId === oldPenalty.groupId) ||
      [];

    // Hoàn tác điểm cũ
    const pointsToRestore = {};
    groupPenalties.forEach((p) => {
      const restoreAmount = p.amount > 0 ? -p.amount : Math.abs(p.amount);
      pointsToRestore[p.playerId] =
        (pointsToRestore[p.playerId] || 0) + restoreAmount;
    });

    // Tính điểm mới
    const newAmount = tempData.editPenaltyAmount;
    const pointsToApply = {};
    groupPenalties.forEach((p) => {
      if (p.amount > 0) {
        // Người đền - trừ điểm
        pointsToApply[p.playerId] = -newAmount;
      } else {
        // Người nhận - cộng điểm
        pointsToApply[p.playerId] = newAmount;
      }
    });

    // Cập nhật penalties với amount mới
    const updatedPenalties = currentSet.penalties.map((p) => {
      if (p.groupId === oldPenalty.groupId) {
        return {
          ...p,
          amount: p.amount > 0 ? newAmount : -newAmount,
        };
      }
      return p;
    });

    setCurrentSet((prev) => ({
      ...prev,
      penalties: updatedPenalties,
      playerPoints: {
        ...prev.playerPoints,
        ...Object.entries(pointsToRestore).reduce((acc, [pid, amt]) => {
          acc[pid] = (prev.playerPoints[pid] || 0) + amt;
          return acc;
        }, {}),
        ...Object.entries(pointsToApply).reduce((acc, [pid, amt]) => {
          acc[pid] = (prev.playerPoints[pid] || 0) + amt;
          return acc;
        }, {}),
      },
    }));

    logAction(
      'Sửa đền',
      `${oldPenalty.note}: ${Math.abs(oldPenalty.amount)} → ${newAmount}`,
    );
    hapticFeedback('medium');

    setModals((prev) => ({ ...prev, editPenalty: false }));
    setTempData((prev) => ({
      ...prev,
      editPenaltyId: null,
      editPenaltyAmount: 0,
      editPenaltyType: 'custom',
    }));
  };

  // Mở modal chỉnh sửa đền
  const openEditPenaltyModal = (penaltyId) => {
    const penalty = currentSet?.penalties?.find((p) => p.id === penaltyId);
    if (!penalty) return;

    // Lấy amount dương (người đền)
    const amount = Math.abs(penalty.amount);

    setTempData((prev) => ({
      ...prev,
      editPenaltyId: penaltyId,
      editPenaltyAmount: amount,
      editPenaltyType: penalty.typeId || 'custom',
    }));
    setModals((prev) => ({ ...prev, editPenalty: true }));
  };

  // Tính tổng đền của mỗi người chơi trong set hiện tại
  const calculateCurrentSetPenalties = useMemo(() => {
    if (!currentSet?.penalties) return {};
    const totals = {};
    currentSet.penalties.forEach((p) => {
      if (!totals[p.playerId]) totals[p.playerId] = 0;
      totals[p.playerId] += p.amount;
    });
    return totals;
  }, [currentSet?.penalties]);

  const finishSet = () => {
    if (!currentSet) return;

    // Hiển thị modal tổng kết trước khi lưu
    setModals((prev) => ({ ...prev, setSummary: true }));
  };

  // Xác nhận kết thúc set và lưu
  const confirmFinishSet = () => {
    hapticFeedback('success');

    // Send Telegram notification
    const setWithTimestamp = { ...currentSet, timestamp: new Date() };

    // Show toast and send async
    if (telegramConfig.botToken && telegramConfig.chatId) {
      sendTelegramNotification(
        generateTelegramMessage('set', setWithTimestamp),
      ).then(() => {});
    }

    logAction('Kết thúc set', `Set ${currentSet.id} đã hoàn thành`);
    setSets((prev) => [...prev, setWithTimestamp]);
    setCurrentSet(null);
    setUndoStack([]);
    setModals((prev) => ({ ...prev, setSummary: false }));
  };

  // Tạo tổng kết set
  const generateSetSummary = useCallback(() => {
    if (!currentSet || !session) return '';

    let summary = `📊 TỔNG KẾT SET ${currentSet.id}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Điểm từng người
    summary += `📈 Điểm số:\n`;
    session.players.forEach((p) => {
      const score = currentSet.playerPoints[p.id] || 0;
      const sign = score > 0 ? '+' : '';
      const color = score > 0 ? '🟢' : score < 0 ? '🔴' : '⚪';
      summary += `  ${color} ${p.name}: ${sign}${score}\n`;
    });

    // Chi tiết đền
    if (currentSet.penalties && currentSet.penalties.length > 0) {
      summary += `\n📝 Chi tiết đền:\n`;
      const byPlayer = {};
      currentSet.penalties.forEach((p) => {
        if (!byPlayer[p.playerName]) byPlayer[p.playerName] = [];
        byPlayer[p.playerName].push(p);
      });

      Object.entries(byPlayer).forEach(([name, penalties]) => {
        const total = penalties.reduce((sum, p) => sum + p.amount, 0);
        summary += `  👤 ${name}: -${total} điểm\n`;
        penalties.forEach((p) => {
          summary += `    - ${p.typeIcon} ${p.typeName}: ${p.amount}${p.note ? ` (${p.note})` : ''}\n`;
        });
      });
    }

    return summary;
  }, [currentSet, session]);

  const deleteSet = (setId) => {
    const deletedSet = sets.find((s) => s.id === setId);
    if (!deletedSet) return;

    setSets((prev) => prev.filter((s) => s.id !== setId));
    logAction('Xóa set', `Đã xóa Set ${setId}`);
    setConfirmDeleteSetId(null);
  };

  const resetCurrentSet = () => {
    if (!currentSet) return;
    pushUndo();
    const resetPoints = {};
    session.players.forEach((p) => (resetPoints[p.id] = 0));
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: resetPoints,
    }));
    logAction('Reset điểm', `Đã reset tất cả điểm Set ${currentSet.id} về 0`);
  };

  const calculateTotalScores = useMemo(() => {
    const totals = {};
    if (!session) return totals;
    session.players.forEach((p) => (totals[p.id] = 0));
    sets.forEach((set) => {
      Object.entries(set.playerPoints).forEach(([pid, score]) => {
        if (totals[pid] !== undefined) totals[pid] += score;
      });
    });
    return totals;
  }, [sets, session]);

  const sortedRankings = useMemo(() => {
    if (!session) return [];
    return [...session.players]
      .map((p) => ({ ...p, total: calculateTotalScores[p.id] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [session, calculateTotalScores]);

  // --- Report Generation ---
  const generateReport = useCallback(() => {
    if (!session) return '';

    const players = session.players;
    const totals = calculateTotalScores;
    const rankings = sortedRankings;
    const startTime =
      session.startTime instanceof Date
        ? session.startTime
        : new Date(session.startTime);

    // Header
    let report = '';
    report += `🎱 ${session.name}\n`;
    report += `📅 ${startTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    report += `⏰ Bắt đầu: ${startTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    report += ` | ${sets.length} set đã chơi\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Rankings
    report += `🏆 BẢNG XẾP HẠNG\n`;
    const medals = ['🥇', '🥈', '🥉'];
    rankings.forEach((p, idx) => {
      const medal = medals[idx] || `  ${idx + 1}.`;
      const sign = p.total > 0 ? '+' : '';
      report += `${medal} ${p.name}: ${sign}${p.total} điểm\n`;
    });
    report += `\n`;

    // Set details
    if (sets.length > 0) {
      report += `📋 CHI TIẾT TỪNG SET\n`;
      report += `─────────────────────────\n`;
      sets.forEach((set) => {
        const time =
          set.timestamp instanceof Date
            ? set.timestamp
            : new Date(set.timestamp);
        report += `Set ${set.id} (${time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}):\n`;
        players.forEach((p) => {
          const score = set.playerPoints[p.id] || 0;
          const sign = score > 0 ? '+' : '';
          report += `  ${p.name}: ${sign}${score}\n`;
        });
        report += `\n`;
      });
    }

    // Summary line
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 TỔNG KẾT\n`;
    players.forEach((p) => {
      const total = totals[p.id] || 0;
      const sign = total > 0 ? '+' : '';
      const bar = total > 0 ? '🟢' : total < 0 ? '🔴' : '⚪';
      report += `${bar} ${p.name}: ${sign}${total}\n`;
    });

    report += `\n🎱 Pool Master`;
    return report;
  }, [session, sets, calculateTotalScores, sortedRankings]);

  // --- Telegram Message Generation ---
  // Escape special characters for HTML
  const escapeHTML = (text) => {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const generateTelegramMessage = useCallback(
    (type = 'set', setData = null) => {
      if (!session) return '';

      const startTime =
        session.startTime instanceof Date
          ? session.startTime
          : new Date(session.startTime);
      const totals = calculateTotalScores;
      const rankings = sortedRankings;
      const medals = ['🥇', '🥈', '🥉'];

      let msg = '';

      if (type === 'set' && setData) {
        // Set completed message
        msg += `🎱 <b>SET ${setData.id} - Session: ${session.name || 'Unnamed Set'} HOÀN THÀNH</b>\n`;
        msg += `━━━━━━━━━━━━━━━━\n\n`;

        msg += `<b>Kết quả:</b>\n`;
        session.players.forEach((p) => {
          const score = setData.playerPoints[p.id] || 0;
          const scoreStr =
            score > 0 ? `+${score}` : score < 0 ? `${score}` : '0';
          const emoji = score > 0 ? '🟢' : score < 0 ? '🔴' : '⚪';
          msg += `${emoji} ${escapeHTML(p.name)}: ${scoreStr}\n`;
        });

        msg += `\n<b>Xếp hạng hiện tại:</b>\n`;
        rankings.forEach((p, idx) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const totalStr =
            p.total > 0 ? `+${p.total}` : p.total < 0 ? `${p.total}` : '0';
          msg += `${medal} ${escapeHTML(p.name)}: ${totalStr}\n`;
        });
      } else if (type === 'session') {
        // Session ended message
        msg += `🎱 <b>KẾT THÚC PHIÊN CHƠI</b>\n`;
        msg += `━━━━━━━━━━━━━━━━\n\n`;

        msg += `📝 <b>${escapeHTML(session.name)}</b>\n`;
        msg += `⏰ ${startTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}\n`;
        msg += `📊 ${sets.length} set đã chơi\n\n`;

        msg += `<b>🏆 BẢNG XẾP HẠNG</b>\n`;
        rankings.forEach((p, idx) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const totalStr =
            p.total > 0 ? `+${p.total}` : p.total < 0 ? `${p.total}` : '0';
          msg += `${medal} ${escapeHTML(p.name)}: ${totalStr} điểm\n`;
        });

        msg += `\n<b>📋 Chi tiết các set:</b>\n`;
        sets.forEach((set) => {
          msg += `Set ${set.id}: `;
          msg += session.players
            .map((p) => {
              const s = set.playerPoints[p.id] || 0;
              const sStr = s > 0 ? `+${s}` : s < 0 ? `${s}` : '0';
              return `${escapeHTML(p.name)}: ${sStr}`;
            })
            .join(', ');
          msg += `\n`;
        });
      }

      msg += `\n<i>🎱 Pool Master</i>`;
      return msg;
    },
    [session, sets, calculateTotalScores, sortedRankings],
  );

  const handleCopyReport = async () => {
    const report = generateReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareReport = async () => {
    const report = generateReport();
    if (navigator.share) {
      try {
        await navigator.share({
          title: session?.name || 'Pool Master',
          text: report,
        });
      } catch {
        /* user cancelled share — ignore */
      }
    } else {
      // Fallback: copy to clipboard if Web Share not supported
      handleCopyReport();
    }
  };

  const generateHistoryReport = useCallback(() => {
    if (actionHistory.length === 0) return 'Chưa có lịch sử thao tác';

    let report = `📜 LỊCH SỬ THAO TÁC - ${session?.name}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    actionHistory.forEach((log, idx) => {
      const time =
        log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
      report += `${idx + 1}. [${time.toLocaleTimeString('vi-VN')}] ${log.action}\n`;
      if (log.details) {
        report += `   ${log.details}\n`;
      }
      report += `\n`;
    });

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Tổng ${actionHistory.length} thao tác`;
    return report;
  }, [actionHistory, session]);

  const handleCopyHistory = async () => {
    const report = generateHistoryReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopiedHistory(true);
      setTimeout(() => setCopiedHistory(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedHistory(true);
      setTimeout(() => setCopiedHistory(false), 2000);
    }
  };

  // --- Format helpers ---
  const formatTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  };

  // --- Views ---

  if (view === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center p-6">
        <div className="w-full max-w-md space-y-8 pt-8">
          {/* Hero Section */}
          <div className="text-center space-y-4">
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-200 dark:shadow-blue-900/30">
              <span className="text-5xl">🎱</span>
            </div>
            <h1 className="text-4xl font-extrabold text-blue-600 tracking-tight">
              Pool Master
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Trình tính điểm Billiard chuyên nghiệp
            </p>
          </div>

          {/* Quick Start Guide */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              🚀 Bắt đầu nhanh
            </h3>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </span>
                <p>Tạo phiên chơi mới</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </span>
                <p>Thêm ít nhất 2 người chơi</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </span>
                <p>Vào bàn và bắt đầu tính điểm!</p>
              </div>
            </div>
          </div>

          {/* New Session */}
          <Card className="p-6 space-y-4">
            <div className="text-left space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Tên Phiên Chơi
              </label>
              <input
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                placeholder="Ví dụ: Tối Thứ 6 Cùng Quý"
                value={tempData.sessionName || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, sessionName: e.target.value })
                }
                onKeyDown={(e) =>
                  e.key === 'Enter' && createSession(tempData.sessionName)
                }
              />
            </div>
            <Button
              className="w-full py-4 text-lg"
              onClick={() => createSession(tempData.sessionName)}
            >
              Bắt Đầu Chơi
            </Button>
          </Card>

          {/* Saved Sessions */}
          {savedSessions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> Phiên chơi đã lưu
              </h3>
              <div className="space-y-2">
                {savedSessions.map((s) => (
                  <Card
                    key={s.id}
                    className="p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 dark:text-white truncate">
                            {s.name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              s.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {s.status === 'active' ? 'Đang chơi' : 'Đã xong'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {(s.players || []).length} người chơi
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            •
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {(s.sets || []).length} set
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            •
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {formatTimeAgo(s.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => continueSession(s)}
                          className="p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 rounded-xl transition-colors cursor-pointer"
                          title="Tiếp tục"
                        >
                          <Play size={18} />
                        </button>
                        {confirmDeleteId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                deleteSavedSession(s.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Xoá
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Huỷ
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 rounded-xl transition-colors cursor-pointer"
                            title="Xoá"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Old players - clickable to pre-select */}
          {allPlayers.length > 0 && (
            <div className="text-left space-y-3">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Người chơi cũ{' '}
                {preSelectedPlayers.length > 0 && (
                  <span className="text-blue-500 dark:text-blue-400 normal-case">
                    — đã chọn {preSelectedPlayers.length}
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {allPlayers.slice(0, 10).map((p) => {
                  const isSelected = preSelectedPlayers.some(
                    (pp) => pp.id === p.id,
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPreSelectedPlayers((prev) =>
                          isSelected
                            ? prev.filter((pp) => pp.id !== p.id)
                            : [...prev, p],
                        );
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-500'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Floating Ranking Badge */}
            {sortedRankings.length > 0 && (
              <div className="hidden sm:flex flex-col items-center bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl px-3 py-1.5 shadow-lg">
                <div className="flex items-center gap-1">
                  <span className="text-xs">🥇</span>
                  <span className="font-bold text-sm truncate max-w-[80px]">
                    {sortedRankings[0]?.name}
                  </span>
                </div>
                <span className="text-xs font-bold opacity-90">
                  {sortedRankings[0]?.total > 0 ? '+' : ''}
                  {sortedRankings[0]?.total}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">
                  {session?.name}
                </h2>
                <button
                  onClick={() => {
                    setTempData((prev) => ({
                      ...prev,
                      editSessionName: session.name,
                    }));
                    setModals({ ...modals, editSessionName: true });
                  }}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Đổi tên phiên chơi"
                >
                  <Edit2 size={16} className="text-slate-400" />
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bắt đầu:{' '}
                {session?.startTime instanceof Date
                  ? session.startTime.toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : new Date(session?.startTime).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
              </p>
            </div>
          </div>
          <div className="flex gap-1 sm:gap-2">
            {/* Mobile ranking toggle */}
            <Button
              variant="secondary"
              onClick={() => setShowMobileRanking(!showMobileRanking)}
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 lg:hidden"
            >
              <Trophy size={14} />
              <span>{showMobileRanking ? 'Ẩn' : 'BXH'}</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, history: true })}
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
            >
              <ScrollText size={14} />{' '}
              <span className="hidden sm:inline">Log</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, report: true })}
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
            >
              <FileText size={14} />{' '}
              <span className="hidden sm:inline">Báo cáo</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, endSession: true })}
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Kết thúc</span>
              <span className="sm:hidden">✋</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, telegramSettings: true })}
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
              title="Cài đặt Telegram"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-2 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Sidebar - Hidden on mobile by default, toggle with button */}
        <div
          className={`lg:col-span-3 space-y-3 sm:space-y-6 order-2 lg:order-1 ${showMobileRanking ? 'block' : 'hidden lg:block'}`}
        >
          <Card className="p-3 sm:p-4">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-white text-sm sm:text-base">
                <Users size={16} /> Người Chơi
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  ({session.players.length})
                </span>
              </h3>
              <button
                onClick={() => setModals({ ...modals, addPlayer: true })}
                className="px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                <UserPlus size={16} />
                Thêm
              </button>
            </div>
            <div className="space-y-2">
              {session.players.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setTempData((prev) => ({
                      ...prev,
                      selectedPlayerId: p.id,
                      editPlayerName: p.name,
                    }));
                    setModals({ ...modals, editPlayer: true });
                  }}
                  className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate text-slate-700 dark:text-slate-200">
                      {p.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTempData((prev) => ({
                          ...prev,
                          selectedPlayerId: p.id,
                          editPlayerName: p.name,
                        }));
                        setModals({ ...modals, editPlayer: true });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded cursor-pointer"
                      title="Đổi tên"
                    >
                      <Edit2 size={14} className="text-slate-400" />
                    </button>
                  </div>
                  {/* Chỉ hiển thị tổng tích lũy trong sidebar - đã loại bỏ khỏi main view */}
                  <span
                    className={`font-bold tabular-nums text-xs ${calculateTotalScores[p.id] >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                  >
                    {calculateTotalScores[p.id] > 0 ? '+' : ''}
                    {calculateTotalScores[p.id]}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-9 space-y-6 order-1 lg:order-2">
          {!currentSet ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div
                onClick={() => setModals({ ...modals, addPlayer: true })}
                className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center animate-pulse"
              >
                <Plus size={40} />
              </div>
              {session.players.length < 2 ? (
                <div className="text-center space-y-2">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    Cần ít nhất 2 người chơi để bắt đầu
                  </p>
                  <p className="text-blue-500 dark:text-blue-400 text-sm">
                    Bạn cần thêm người chơi mới
                  </p>
                </div>
              ) : (
                <Button
                  className="px-10 py-4 text-lg shadow-xl shadow-blue-200 dark:shadow-blue-900/30"
                  onClick={startNewSet}
                >
                  Vào Bàn Ngay
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Hiển thị tất cả các khoản đền trong set - nhìn nhanh tổng quan */}
              {currentSet?.penalties && currentSet.penalties.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700">
                  <h4 className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                    💰 ĐỀN TRONG SET
                    <span className="ml-auto bg-amber-200 dark:bg-amber-700 px-2 py-0.5 rounded-full text-xs">
                      -
                      {currentSet.penalties
                        .filter((p) => p.amount > 0)
                        .reduce((sum, p) => sum + p.amount, 0)}
                    </span>
                  </h4>
                  <div className="space-y-1.5">
                    {currentSet.penalties
                      .filter((p) => p.amount > 0)
                      .map((penalty) => (
                        <div
                          key={penalty.id}
                          className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-600 group"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-bold text-red-600 dark:text-red-400 text-sm sm:text-base shrink-0">
                              {penalty.playerName}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400 text-sm shrink-0">
                              →
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {penalty.note?.replace('đền ', '') || ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="font-black text-amber-600 dark:text-amber-400 text-base sm:text-lg">
                              -{penalty.amount}
                            </span>
                            <button
                              onClick={() => openEditPenaltyModal(penalty.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-all cursor-pointer"
                              title="Sửa đền"
                            >
                              <Edit2 size={14} className="text-blue-500" />
                            </button>
                            <button
                              onClick={() => removePenalty(penalty.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all cursor-pointer"
                              title="Xóa đền"
                            >
                              <Trash2 size={14} className="text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 sm:gap-3 justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 uppercase">
                  SET {currentSet.id}
                </h3>
                <div className="flex gap-1 flex-wrap">
                  <Button
                    variant="warning"
                    onClick={() => setModals({ ...modals, addPenalty: true })}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs"
                  >
                    💰 Đền
                  </Button>
                </div>
              </div>

              {/* Player Score Grid - Display only: Set info + Ai đền ai + Cộng trừ */}
              <div className="space-y-4">
                {/* Set Header */}
                <Card className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-wider">
                        Set {currentSet.id}
                      </h3>
                      <p className="text-blue-100 text-sm">
                        {session.players.length} người chơi
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-100 uppercase tracking-wider">
                        Tổng đền
                      </p>
                      <p className="text-3xl font-black">
                        -
                        {currentSet.penalties
                          ?.filter((p) => p.amount > 0)
                          .reduce((sum, p) => sum + p.amount, 0) || 0}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Ai đền ai - Cộng trừ */}
                {session.players.map((p) => {
                  // Lấy danh sách đền của người chơi này (amount > 0 = người đền, amount < 0 = người được đền)
                  const playerPenalties =
                    currentSet?.penalties?.filter((pen) => pen.playerId === p.id) || [];
                  
                  // Tính tổng điểm
                  const totalScore = currentSet.playerPoints[p.id] || 0;

                  // Tách ra: đền người khác (nợ) và được người khác đền (có)
                  const owedToOthers = playerPenalties.filter((pen) => pen.amount > 0);
                  const receivedFromOthers = playerPenalties.filter((pen) => pen.amount < 0);

                  return (
                    <Card
                      key={p.id}
                      className="p-4 space-y-3"
                    >
                      {/* Tên và Tổng điểm */}
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
                        <h4 className="font-bold text-lg text-slate-800 dark:text-white">
                          {p.name}
                        </h4>
                        <div className="text-right">
                          <span className={`text-2xl font-black tabular-nums ${
                            totalScore >= 0 ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {totalScore > 0 ? '+' : ''}{totalScore}
                          </span>
                        </div>
                      </div>

                      {/* Chi tiết cộng trừ */}
                      <div className="space-y-2">
                        {/* Đền người khác (nợ) */}
                        {owedToOthers.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">
                              🔴 Đền người khác
                            </p>
                            <div className="space-y-1">
                              {owedToOthers.map((pen) => (
                                <div
                                  key={pen.id}
                                  className="flex justify-between items-center text-sm bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2"
                                >
                                  <span className="text-slate-600 dark:text-slate-300">
                                    → {pen.note?.replace('đền ', '') || ''}
                                  </span>
                                  <span className="font-bold text-red-500">
                                    -{pen.amount}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Được người khác đền (có) */}
                        {receivedFromOthers.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">
                              🟢 Được đền
                            </p>
                            <div className="space-y-1">
                              {receivedFromOthers.map((pen) => (
                                <div
                                  key={pen.id}
                                  className="flex justify-between items-center text-sm bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2"
                                >
                                  <span className="text-slate-600 dark:text-slate-300">
                                    ← {pen.note?.replace('đền ', '') || ''}
                                  </span>
                                  <span className="font-bold text-emerald-500">
                                    +{Math.abs(pen.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Không có đền */}
                        {playerPenalties.length === 0 && (
                          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-2">
                            Chưa có đền trong set này
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="pt-4 sm:pt-6 border-t border-slate-200 dark:border-slate-700">
                <Button
                  variant="success"
                  className="w-full py-4 sm:py-5 text-lg sm:text-xl font-black shadow-xl shadow-emerald-100 dark:shadow-none uppercase tracking-widest"
                  onClick={finishSet}
                >
                  Kết Thúc Set & Lưu
                </Button>
              </div>
            </div>
          )}

          {/* History - Compact for mobile, click to view details */}
          {sets.length > 0 && (
            <div className="mt-12 space-y-3">
              <h3 className="font-bold flex items-center gap-2 text-slate-400 dark:text-slate-500 uppercase tracking-widest text-xs px-2">
                <History size={16} /> Nhật ký ván đấu
              </h3>
              <div className="space-y-2">
                {[...sets].reverse().map((set) => {
                  // Tính tổng đền trong set
                  const totalPenalty = set.penalties
                    ?.filter((p) => p.amount > 0)
                    .reduce((sum, p) => sum + p.amount, 0) || 0;

                  return (
                    <div
                      key={set.id}
                      className="relative"
                    >
                      {confirmDeleteSetId === set.id ? (
                        <Card className="p-3 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-black text-red-600 dark:text-red-400">
                                SET {set.id}
                              </span>
                              {totalPenalty > 0 && (
                                <span className="ml-2 text-xs text-amber-600">
                                  💰 -{totalPenalty}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setConfirmDeleteSetId(null)}
                                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                Hủy
                              </button>
                              <button
                                onClick={() => deleteSet(set.id)}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                        </Card>
                      ) : (
                        <Card
                          onClick={() => {
                            setSelectedSetDetail(set);
                            setModals((prev) => ({ ...prev, setDetail: true }));
                          }}
                          className="p-3 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-black text-slate-700 dark:text-slate-300 text-sm">
                              Set {set.id}
                            </span>
                            {totalPenalty > 0 && (
                              <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                💰 -{totalPenalty}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto">
                            {session.players.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center gap-1 text-xs"
                              >
                                <span className="text-slate-400 dark:text-slate-500 truncate max-w-[50px]">
                                  {p.name}
                                </span>
                                <span
                                  className={`font-bold tabular-nums ${
                                    (set.playerPoints[p.id] || 0) >= 0
                                      ? 'text-emerald-500'
                                      : 'text-red-500'
                                  }`}
                                >
                                  {(set.playerPoints[p.id] || 0) > 0 ? '+' : ''}
                                  {set.playerPoints[p.id] || 0}
                                </span>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- Modals --- */}
      <Modal
        isOpen={modals.addPlayer}
        onClose={() => setModals({ ...modals, addPlayer: false })}
        title="Thêm Người Chơi"
      >
        <div className="space-y-4">
          <input
            autoFocus
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên người chơi..."
            value={tempData.playerName}
            onChange={(e) =>
              setTempData({ ...tempData, playerName: e.target.value })
            }
            onKeyDown={(e) =>
              e.key === 'Enter' && addPlayerToSession(tempData.playerName)
            }
          />
          <Button
            className="w-full py-4"
            onClick={() => addPlayerToSession(tempData.playerName)}
          >
            Xác Nhận
          </Button>

          {/* Quick add from old players */}
          {(() => {
            const sessionPlayerNames =
              session?.players?.map((p) => p.name) || [];
            const availablePlayers = allPlayers.filter(
              (p) => !sessionPlayerNames.includes(p.name),
            );
            if (availablePlayers.length === 0) return null;
            return (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Thêm nhanh
                </label>
                <div className="flex flex-wrap gap-2">
                  {availablePlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addPlayerToSession(p.name, true)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all cursor-pointer"
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      <Modal
        isOpen={modals.penalizeAll}
        onClose={() => setModals({ ...modals, penalizeAll: false })}
        title="Cả Làng Đền"
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Người thắng (Người được đền)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {session.players.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setTempData({ ...tempData, selectedPlayerId: p.id })
                  }
                  className={`p-3 rounded-xl font-bold border-2 transition-all cursor-pointer ${tempData.selectedPlayerId === p.id ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Mức đền (cộng dồn)
            </label>
            <div className="text-center bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Tổng mức đền:
              </span>
              <span className="ml-2 text-3xl font-black text-amber-600">
                {tempData.penalizeAmount}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                điểm
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      penalizeAmount: prev.penalizeAmount + val,
                    }))
                  }
                  className="py-3 rounded-xl font-black text-sm bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, penalizeAmount: 0 }))
              }
              className="w-full py-2 rounded-lg text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
            >
              Reset về 0
            </button>
          </div>
          <Button
            variant="success"
            className="w-full py-4 text-lg font-black"
            disabled={
              !tempData.selectedPlayerId || tempData.penalizeAmount === 0
            }
            onClick={handlePenalizeAllAction}
          >
            Thực Hiện Đền ({tempData.penalizeAmount} điểm)
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.transfer}
        onClose={() => setModals({ ...modals, transfer: false })}
        title="X Đền Y"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-11 items-center gap-1">
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                Người Đền (X)
              </label>
              <select
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm text-slate-800 dark:text-white"
                value={tempData.selectedPlayerId || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, selectedPlayerId: e.target.value })
                }
              >
                <option value="">Chọn...</option>
                {session.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1 text-center mt-6 text-slate-300 dark:text-slate-500">
              <ArrowRightLeft size={16} />
            </div>
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                Người Nhận (Y)
              </label>
              <select
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm text-slate-800 dark:text-white"
                value={tempData.targetPlayerId || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, targetPlayerId: e.target.value })
                }
              >
                <option value="">Chọn...</option>
                {session.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Mức đền (cộng dồn)
            </label>
            <div className="text-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Tổng cộng:
              </span>
              <span className="ml-2 text-3xl font-black text-blue-600">
                {tempData.transferAmount}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                điểm
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      transferAmount: prev.transferAmount + val,
                    }))
                  }
                  className="py-3 rounded-xl font-black text-sm bg-blue-500 hover:bg-blue-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, transferAmount: 0 }))
              }
              className="w-full py-2 rounded-lg text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
            >
              Reset về 0
            </button>
          </div>

          <Button
            className="w-full py-4 text-lg font-black uppercase"
            disabled={
              !tempData.selectedPlayerId ||
              !tempData.targetPlayerId ||
              tempData.selectedPlayerId === tempData.targetPlayerId ||
              tempData.transferAmount === 0
            }
            onClick={handleTransfer}
          >
            Xác nhận đền ({tempData.transferAmount} điểm)
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.editScore}
        onClose={() => setModals({ ...modals, editScore: false })}
        title="Chỉnh Sửa Điểm Tuyệt Đối"
      >
        <div className="space-y-4">
          <input
            type="number"
            className="text-7xl font-black w-full bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl text-center outline-none text-blue-600 dark:text-blue-400"
            value={tempData.manualScore}
            onChange={(e) =>
              setTempData({ ...tempData, manualScore: e.target.value })
            }
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleManualScoreChange}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Add Penalty Modal - Ghi nhận đền: A đền B X điểm - Minimal for mobile */}
      <Modal
        isOpen={modals.addPenalty}
        onClose={() => setModals({ ...modals, addPenalty: false })}
        title="A đền B"
      >
        <div className="space-y-3">
          {/* Quick summary - minimal */}
          {currentSet?.penalties && currentSet.penalties.length > 0 && (
            <div className="text-center">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                💰 Tổng: -
                {currentSet.penalties
                  .filter((p) => p.amount > 0)
                  .reduce((sum, p) => sum + p.amount, 0)}
              </span>
            </div>
          )}

          {/* Chọn người đền (A) - compact */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-red-500 uppercase">
              Người đền
            </label>
            <div className="flex flex-wrap gap-1.5">
              {session.players.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setTempData({ ...tempData, selectedPlayerId: p.id })
                  }
                  className={`px-3 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                    tempData.selectedPlayerId === p.id
                      ? 'bg-red-500 text-white shadow-lg'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Chọn người nhận (B) - compact */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-emerald-500 uppercase">
              Người nhận
            </label>
            <div className="flex flex-wrap gap-1.5">
              {session.players
                .filter((p) => p.id !== tempData.selectedPlayerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setTempData({ ...tempData, targetPlayerId: p.id })
                    }
                    className={`px-3 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                      tempData.targetPlayerId === p.id
                        ? 'bg-emerald-500 text-white shadow-lg'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>

          {/* Nhập số tiền - compact */}
          <div className="space-y-1.5">
            <div className="text-center bg-amber-50 dark:bg-amber-900/20 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
              <span className="text-4xl font-black text-amber-600">
                {tempData.penaltyAmount}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      penaltyAmount: prev.penaltyAmount + val,
                    }))
                  }
                  className="py-2.5 rounded-lg font-black text-base bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[2, 3, 4, 5].map((mult) => (
                <button
                  key={`x${mult}`}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      penaltyAmount: prev.penaltyAmount * mult,
                    }))
                  }
                  className="py-2 rounded-lg font-bold text-sm bg-purple-500 hover:bg-purple-600 text-white transition-all active:scale-95 cursor-pointer"
                >
                  x{mult}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, penaltyAmount: 10 }))
              }
              className="w-full py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
            >
              Reset
            </button>
          </div>

          <Button
            variant="danger"
            className="w-full py-3 text-base font-bold"
            disabled={
              !tempData.selectedPlayerId ||
              !tempData.targetPlayerId ||
              tempData.penaltyAmount === 0
            }
            onClick={() => {
              // A đền B X điểm = A -X, B +X
              const fromName = session.players.find(
                (p) => p.id === tempData.selectedPlayerId,
              )?.name;
              const toName = session.players.find(
                (p) => p.id === tempData.targetPlayerId,
              )?.name;
              const groupId = Date.now(); // Dùng chung cho cặp đền

              // Thêm khoản đền cho người đền (A) - amount dương = bị trừ
              const penaltyForPayer = {
                id: Date.now(),
                groupId,
                playerId: tempData.selectedPlayerId,
                playerName: fromName,
                typeId: 'custom',
                typeName: 'Đền',
                typeIcon: '💰',
                amount: tempData.penaltyAmount,
                note: `đền ${toName}`,
                timestamp: new Date(),
              };

              // Thêm khoản đền cho người nhận (B) - amount âm = được cộng
              const penaltyForReceiver = {
                id: Date.now() + 1,
                groupId,
                playerId: tempData.targetPlayerId,
                playerName: toName,
                typeId: 'custom',
                typeName: 'Đền',
                typeIcon: '💰',
                amount: -tempData.penaltyAmount,
                note: `${fromName} đền`,
                timestamp: new Date(),
              };

              pushUndo();
              setCurrentSet((prev) => ({
                ...prev,
                penalties: [
                  ...(prev.penalties || []),
                  penaltyForPayer,
                  penaltyForReceiver,
                ],
                playerPoints: {
                  ...prev.playerPoints,
                  [tempData.selectedPlayerId]:
                    (prev.playerPoints[tempData.selectedPlayerId] || 0) -
                    tempData.penaltyAmount,
                  [tempData.targetPlayerId]:
                    (prev.playerPoints[tempData.targetPlayerId] || 0) +
                    tempData.penaltyAmount,
                },
              }));

              logAction(
                'Thêm đền',
                `${fromName} đền ${toName} ${tempData.penaltyAmount} điểm`,
              );
              hapticFeedback('medium');

              // Hiện toast thông báo
              setToast({
                type: 'success',
                message: `✅ ${fromName} đền ${toName} ${tempData.penaltyAmount}`,
              });
              setTimeout(() => setToast(null), 2000);

              // Reset nhưng KHÔNG đóng modal - để đền tiếp được
              setTempData((prev) => ({
                ...prev,
                penaltyAmount: 10,
                targetPlayerId: null,
                selectedPlayerId: null, // Reset để chọn lại từ đầu
              }));
            }}
          >
            {tempData.selectedPlayerId && tempData.targetPlayerId
              ? `✅ ${session.players.find((p) => p.id === tempData.selectedPlayerId)?.name} đền ${session.players.find((p) => p.id === tempData.targetPlayerId)?.name} ${tempData.penaltyAmount}`
              : 'CHỌN NGƯỜI ĐỀN'}
          </Button>

          {currentSet?.penalties && currentSet.penalties.length > 0 && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                setModals((prev) => ({ ...prev, addPenalty: false }));
                setTempData((prev) => ({
                  ...prev,
                  penaltyAmount: 10,
                  targetPlayerId: null,
                  selectedPlayerId: null,
                }));
              }}
            >
              Đóng
            </Button>
          )}
        </div>
      </Modal>

      {/* Set Summary Modal - Tổng kết khi kết thúc set */}
      <Modal
        isOpen={modals.setSummary}
        onClose={() => setModals({ ...modals, setSummary: false })}
        title={`Tổng Kết Set ${currentSet?.id || ''}`}
      >
        <div className="space-y-4">
          {/* Điểm số */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">
              📈 Điểm Set
            </h4>
            <div className="space-y-2">
              {session.players.map((p) => {
                const score = currentSet?.playerPoints[p.id] || 0;
                return (
                  <div key={p.id} className="flex justify-between items-center">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {p.name}
                    </span>
                    <span
                      className={`font-black text-lg tabular-nums ${
                        score > 0
                          ? 'text-emerald-500'
                          : score < 0
                            ? 'text-red-500'
                            : 'text-slate-500'
                      }`}
                    >
                      {score > 0 ? '+' : ''}
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chi tiết đền */}
          {currentSet?.penalties && currentSet.penalties.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase mb-3">
                📝 Chi Tiết Đền ({currentSet.penalties.length} khoản)
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {currentSet.penalties
                  .filter((p) => p.amount > 0)
                  .map((penalty) => (
                    <div
                      key={penalty.id}
                      className="flex justify-between items-center bg-white dark:bg-slate-800 rounded-lg px-3 py-2 group"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span>{penalty.typeIcon}</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {penalty.playerName}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          {penalty.note}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-500">
                          -{penalty.amount}
                        </span>
                        <button
                          onClick={() => openEditPenaltyModal(penalty.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-all cursor-pointer"
                          title="Sửa"
                        >
                          <Edit2 size={14} className="text-blue-500" />
                        </button>
                        <button
                          onClick={() => removePenalty(penalty.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 py-4 text-lg font-bold"
              onClick={() =>
                setModals((prev) => ({ ...prev, setSummary: false }))
              }
            >
              Tiếp Tục Chơi
            </Button>
            <Button
              variant="success"
              className="flex-1 py-4 text-lg font-black"
              onClick={confirmFinishSet}
            >
              Lưu Set
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Penalty Modal */}
      <Modal
        isOpen={modals.editPenalty}
        onClose={() => {
          setModals((prev) => ({ ...prev, editPenalty: false }));
          setTempData((prev) => ({
            ...prev,
            editPenaltyId: null,
            editPenaltyAmount: 0,
          }));
        }}
        title="Sửa Đền"
      >
        <div className="space-y-4">
          {currentSet?.penalties &&
            tempData.editPenaltyId &&
            (() => {
              const penalty = currentSet.penalties.find(
                (p) => p.id === tempData.editPenaltyId,
              );
              if (!penalty) return null;
              return (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-700">
                  <p className="text-sm text-center text-amber-700 dark:text-amber-300 font-medium">
                    {penalty.note || penalty.typeName}
                  </p>
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400 mt-1">
                    (Người đền: {penalty.playerName})
                  </p>
                </div>
              );
            })()}

          {/* Nhập số tiền mới */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
              Số tiền mới
            </label>
            <div className="text-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <span className="text-5xl font-black text-blue-600">
                {tempData.editPenaltyAmount}
              </span>
              <span className="text-sm text-slate-500 ml-1">điểm</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      editPenaltyAmount: prev.editPenaltyAmount + val,
                    }))
                  }
                  className="py-4 rounded-xl font-black text-lg bg-blue-500 hover:bg-blue-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[15, 20, 25, 30].map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      editPenaltyAmount: prev.editPenaltyAmount + val,
                    }))
                  }
                  className="py-3 rounded-xl font-black text-sm bg-blue-500 hover:bg-blue-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, editPenaltyAmount: 0 }))
              }
              className="w-full py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
            >
              Reset về 0
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 py-4 text-lg font-bold"
              onClick={() => {
                setModals((prev) => ({ ...prev, editPenalty: false }));
                setTempData((prev) => ({
                  ...prev,
                  editPenaltyId: null,
                  editPenaltyAmount: 0,
                }));
              }}
            >
              Huỷ
            </Button>
            <Button
              className="flex-1 py-4 text-lg font-black"
              disabled={tempData.editPenaltyAmount === 0}
              onClick={editPenalty}
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Set Detail Modal - Xem chi tiết set đã lưu */}
      <Modal
        isOpen={modals.setDetail}
        onClose={() => {
          setModals((prev) => ({ ...prev, setDetail: false }));
          setSelectedSetDetail(null);
        }}
        title={`Set ${selectedSetDetail?.id || ''}`}
      >
        <div className="space-y-4">
          {/* Thời gian */}
          {selectedSetDetail?.timestamp && (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500">
              {new Date(selectedSetDetail.timestamp).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              })}
            </p>
          )}

          {/* Điểm số */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">
              📈 Điểm Set
            </h4>
            <div className="space-y-2">
              {session.players.map((p) => {
                const score = selectedSetDetail?.playerPoints?.[p.id] || 0;
                return (
                  <div key={p.id} className="flex justify-between items-center">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {p.name}
                    </span>
                    <span
                      className={`font-black text-lg tabular-nums ${
                        score > 0
                          ? 'text-emerald-500'
                          : score < 0
                            ? 'text-red-500'
                            : 'text-slate-500'
                      }`}
                    >
                      {score > 0 ? '+' : ''}
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chi tiết đền */}
          {selectedSetDetail?.penalties && selectedSetDetail.penalties.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase mb-3">
                📝 Chi Tiết Đền ({selectedSetDetail.penalties.filter(p => p.amount > 0).length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedSetDetail.penalties
                  .filter((p) => p.amount > 0)
                  .map((penalty) => (
                    <div
                      key={penalty.id}
                      className="flex justify-between items-center bg-white dark:bg-slate-800 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span>{penalty.typeIcon}</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {penalty.playerName}
                        </span>
                        <span className="text-xs text-slate-500">
                          → {penalty.note?.replace('đền ', '') || ''}
                        </span>
                      </div>
                      <span className="font-bold text-red-500">
                        -{penalty.amount}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setModals((prev) => ({ ...prev, setDetail: false }));
              setSelectedSetDetail(null);
            }}
          >
            Đóng
          </Button>
        </div>
      </Modal>

      {/* Edit Player Name Modal */}
      <Modal
        isOpen={modals.editPlayer}
        onClose={() => setModals({ ...modals, editPlayer: false })}
        title="Đổi Tên Người Chơi"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên mới..."
            value={tempData.editPlayerName}
            onChange={(e) =>
              setTempData({ ...tempData, editPlayerName: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && handleRenamePlayer()}
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleRenamePlayer}
            disabled={!tempData.editPlayerName.trim()}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Edit Session Name Modal */}
      <Modal
        isOpen={modals.editSessionName}
        onClose={() => setModals({ ...modals, editSessionName: false })}
        title="Đổi Tên Phiên Chơi"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên phiên chơi mới..."
            value={tempData.editSessionName}
            onChange={(e) =>
              setTempData({ ...tempData, editSessionName: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSession()}
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleRenameSession}
            disabled={!tempData.editSessionName.trim()}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Report Modal */}
      <Modal
        isOpen={modals.report}
        onClose={() => setModals({ ...modals, report: false })}
        title="Báo Cáo Phiên Chơi"
      >
        <div className="space-y-4">
          <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[50vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            {generateReport()}
          </pre>
          <div className="flex gap-2">
            <Button
              className="flex-1 py-4 text-lg font-bold flex items-center justify-center gap-2"
              variant={copied ? 'success' : 'primary'}
              onClick={handleCopyReport}
            >
              {copied ? (
                <>
                  <Check size={20} /> Đã Copy!
                </>
              ) : (
                <>
                  <ClipboardCopy size={20} /> Copy
                </>
              )}
            </Button>
            {telegramConfig.botToken && telegramConfig.chatId && (
              <Button
                className="flex-1 py-4 text-lg font-bold flex items-center justify-center gap-2"
                variant="secondary"
                onClick={() => sendTelegramNotification(generateReport())}
              >
                <Send size={20} /> Telegram
              </Button>
            )}
            <Button
              className="flex-1 py-4 text-lg font-bold flex items-center justify-center gap-2"
              variant="secondary"
              onClick={handleShareReport}
            >
              <Share2 size={20} /> Chia sẻ
            </Button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={modals.history}
        onClose={() => setModals({ ...modals, history: false })}
        title="Lịch Sử Thao Tác"
      >
        <div className="space-y-4">
          {actionHistory.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8">
              Chưa có lịch sử thao tác
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {[...actionHistory].reverse().map((log, idx) => {
                const time =
                  log.timestamp instanceof Date
                    ? log.timestamp
                    : new Date(log.timestamp);
                return (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-slate-800 dark:text-white">
                          {log.action}
                        </p>
                        {log.details && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {log.details}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {time.toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Button
            className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2"
            variant={copiedHistory ? 'success' : 'primary'}
            onClick={handleCopyHistory}
            disabled={actionHistory.length === 0}
          >
            {copiedHistory ? (
              <>
                <Check size={20} /> Đã Copy!
              </>
            ) : (
              <>
                <ClipboardCopy size={20} /> Copy Lịch Sử
              </>
            )}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.endSession}
        onClose={() => setModals({ ...modals, endSession: false })}
        title="Kết Thúc"
      >
        <div className="space-y-6">
          <p className="text-slate-500 dark:text-slate-400">
            Phiên chơi sẽ được lưu lại. Bạn có thể tiếp tục sau từ trang chủ.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setModals({ ...modals, endSession: false })}
            >
              Huỷ
            </Button>
            <Button
              variant="danger"
              className="flex-1 font-bold"
              onClick={endSession}
            >
              Kết Thúc & Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Telegram Settings Modal */}
      <Modal
        isOpen={modals.telegramSettings}
        onClose={() => setModals({ ...modals, telegramSettings: false })}
        title="Cài đặt Telegram"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nhận thông báo về kết quả set qua Telegram
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
              Bot Token
            </label>
            <input
              type="text"
              className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-white"
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              value={telegramConfig.botToken}
              onChange={(e) =>
                setTelegramConfig({
                  ...telegramConfig,
                  botToken: e.target.value,
                })
              }
            />
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              Tạo bot tại @BotFather →
            </a>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
              Chat ID
            </label>
            <input
              type="text"
              className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-white"
              placeholder="123456789"
              value={telegramConfig.chatId}
              onChange={(e) =>
                setTelegramConfig({ ...telegramConfig, chatId: e.target.value })
              }
            />
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              Lấy Chat ID tại @userinfobot →
            </a>
          </div>

          <div className="pt-2">
            <Button
              className="w-full"
              variant={
                telegramConfig.botToken && telegramConfig.chatId
                  ? 'success'
                  : 'secondary'
              }
              onClick={() => {
                if (telegramConfig.botToken && telegramConfig.chatId) {
                  sendTelegramNotification(
                    '🎱 Pool Master đã kết nối thành công!',
                  );
                }
              }}
            >
              {telegramConfig.botToken && telegramConfig.chatId
                ? '✅ Đã lưu - Bấm để test'
                : 'Lưu cài đặt'}
            </Button>
          </div>
        </div>
      </Modal>

      {!currentSet && session.players.length >= 2 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xs px-3 sm:px-4">
          <Button
            className="w-full py-4 sm:py-5 rounded-2xl shadow-2xl dark:shadow-blue-900/30 flex items-center justify-center gap-2 text-lg sm:text-xl font-black uppercase tracking-tighter"
            onClick={startNewSet}
          >
            <Plus size={24} sm:size={28} />{' '}
            <span className="hidden sm:inline">Bắt Đầu Ván Mới</span>
            <span className="sm:hidden">Vào Bàn</span>
          </Button>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slide-down ${
            toast.type === 'success'
              ? 'bg-emerald-500 text-white'
              : toast.type === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-blue-500 text-white'
          }`}
        >
          {toast.type === 'success' && <Check size={18} />}
          {toast.type === 'error' && <XCircle size={18} />}
          {toast.type === 'info' && <Send size={18} />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
