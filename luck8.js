const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
// ===== FIX CHO RENDER =====
const PORT = process.env.PORT || 5000;

const API_URL_HU = 'https://luck8bot.com/api/GetNewLottery/Taixiu';
const API_URL_MD5 = 'https://luck8bot.com/api/GetNewLottery/TaixiuMd5';

// ===================================================
const LEARNING_FILE = 'learning_data.json';
const HISTORY_FILE = 'prediction_history.json';

let predictionHistory = {
  hu: [],
  md5: []
};

const MAX_HISTORY = 100;
const AUTO_SAVE_INTERVAL = 30000;
let lastProcessedPhien = { hu: null, md5: null };

let learningData = {
  hu: {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: {},
    lastUpdate: null,
    streakAnalysis: { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, worstStreak: 0 },
    adaptiveThresholds: {},
    recentAccuracy: []
  },
  md5: {
    predictions: [],
    patternStats: {},
    totalPredictions: 0,
    correctPredictions: 0,
    patternWeights: {},
    lastUpdate: null,
    streakAnalysis: { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, worstStreak: 0 },
    adaptiveThresholds: {},
    recentAccuracy: []
  }
};

const DEFAULT_PATTERN_WEIGHTS = {
  'cau_bet': 1.0, 'cau_dao_11': 1.0, 'cau_22': 1.0, 'cau_33': 1.0, 'cau_121': 1.0,
  'cau_123': 1.0, 'cau_321': 1.0, 'cau_nhay_coc': 1.0, 'cau_nhip_nghieng': 1.0,
  'cau_3van1': 1.0, 'cau_be_cau': 1.0, 'cau_chu_ky': 1.0, 'distribution': 1.0,
  'dice_pattern': 1.0, 'sum_trend': 1.0, 'edge_cases': 1.0, 'momentum': 1.0,
  'cau_tu_nhien': 1.0, 'dice_trend_line': 1.0, 'dice_trend_line_md5': 1.0,
  'break_pattern_hu': 1.0, 'break_pattern_md5': 1.0, 'fibonacci': 1.0,
  'resistance_support': 1.0, 'wave': 1.0, 'golden_ratio': 1.0, 'day_gay': 1.0,
  'day_gay_md5': 1.0, 'cau_44': 1.0, 'cau_55': 1.0, 'cau_212': 1.0,
  'cau_1221': 1.0, 'cau_2112': 1.0, 'cau_gap': 1.0, 'cau_ziczac': 1.0,
  'cau_doi': 1.0, 'cau_rong': 1.0, 'smart_bet': 1.0, 'break_pattern_advanced': 1.0,
  'break_streak': 1.0, 'alternating_break': 1.0, 'double_pair_break': 1.0, 'triple_pattern': 1.0,
  'machine_learning': 1.2, 'neural_network': 1.3, 'reinforcement': 1.25,
  'ensemble_voting': 1.35, 'trend_analysis_advanced': 1.2, 'pattern_recognition_deep': 1.3,
  'anomaly_detection': 1.15, 'time_series_forecast': 1.2, 'markov_chain': 1.25,
  'genetic_algorithm': 1.3, 'fuzzy_logic': 1.15, 'bayesian_inference': 1.2,
  'support_vector': 1.25, 'random_forest': 1.3, 'gradient_boost': 1.35
};

// ==================== CACHE CHO LUCK8 ====================
let historicalDataCache = { hu: [], md5: [] };

function transformApiData(apiData) {
  if (!apiData || apiData.state !== 1 || !apiData.data) return null;
  
  const item = apiData.data;
  const openCodeParts = item.OpenCode.split(',').map(num => parseInt(num.trim()));
  if (openCodeParts.length !== 3) return null;
  
  const tong = openCodeParts[0] + openCodeParts[1] + openCodeParts[2];
  const ketQua = tong >= 11 ? 'Tài' : 'Xỉu';
  const phien = parseInt(item.Expect);
  
  return [{
    Phien: phien,
    Ket_qua: ketQua,
    Xuc_xac_1: openCodeParts[0],
    Xuc_xac_2: openCodeParts[1],
    Xuc_xac_3: openCodeParts[2],
    Tong: tong
  }];
}

async function fetchDataHu() {
  try {
    const response = await axios.get(API_URL_HU, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const transformed = transformApiData(response.data);
    if (transformed && transformed.length > 0) {
      const existingIndex = historicalDataCache.hu.findIndex(item => item.Phien === transformed[0].Phien);
      if (existingIndex === -1) {
        historicalDataCache.hu.unshift(transformed[0]);
        if (historicalDataCache.hu.length > 50) historicalDataCache.hu = historicalDataCache.hu.slice(0, 50);
      }
      return historicalDataCache.hu;
    }
    return historicalDataCache.hu;
  } catch (error) {
    console.error('Error fetching HU data:', error.message);
    return historicalDataCache.hu.length > 0 ? historicalDataCache.hu : null;
  }
}

async function fetchDataMd5() {
  try {
    const response = await axios.get(API_URL_MD5, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const transformed = transformApiData(response.data);
    if (transformed && transformed.length > 0) {
      const existingIndex = historicalDataCache.md5.findIndex(item => item.Phien === transformed[0].Phien);
      if (existingIndex === -1) {
        historicalDataCache.md5.unshift(transformed[0]);
        if (historicalDataCache.md5.length > 50) historicalDataCache.md5 = historicalDataCache.md5.slice(0, 50);
      }
      return historicalDataCache.md5;
    }
    return historicalDataCache.md5;
  } catch (error) {
    console.error('Error fetching MD5 data:', error.message);
    return historicalDataCache.md5.length > 0 ? historicalDataCache.md5 : null;
  }
}

// ==================== HÀM PHÂN TÍCH CẦU CƠ BẢN ====================

function analyzeCauBet(results, type) {
  if (results.length < 3) return { detected: false };
  let streakType = results[0], streakLength = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === streakType) streakLength++;
    else break;
  }
  if (streakLength >= 3) {
    let shouldBreak = streakLength >= 6;
    return { 
      detected: true, 
      type: streakType, 
      length: streakLength, 
      prediction: shouldBreak ? (streakType === 'Tài' ? 'Xỉu' : 'Tài') : streakType, 
      confidence: Math.min(85, 50 + (shouldBreak ? 15 : 10)), 
      name: `Cầu Bệt ${streakLength} phiên`,
      patternId: 'cau_bet' 
    };
  }
  return { detected: false };
}

function analyzeCauDao11(results, type) {
  if (results.length < 4) return { detected: false };
  let alternatingLength = 1;
  for (let i = 1; i < Math.min(results.length, 10); i++) {
    if (results[i] !== results[i - 1]) alternatingLength++;
    else break;
  }
  if (alternatingLength >= 4) {
    return { 
      detected: true, 
      length: alternatingLength, 
      prediction: results[0] === 'Tài' ? 'Xỉu' : 'Tài', 
      confidence: Math.min(85, 50 + alternatingLength * 3), 
      name: `Cầu Đảo 1-1 (${alternatingLength} phiên)`,
      patternId: 'cau_dao_11' 
    };
  }
  return { detected: false };
}

function analyzeCau22(results, type) {
  if (results.length < 6) return { detected: false };
  let pairCount = 0, i = 0, pattern = [];
  while (i < results.length - 1 && pairCount < 4) {
    if (results[i] === results[i + 1]) { 
      pattern.push(results[i]); 
      pairCount++; 
      i += 2; 
    } else break;
  }
  if (pairCount >= 2) {
    let isAlternating = true;
    for (let j = 1; j < pattern.length; j++) { 
      if (pattern[j] === pattern[j - 1]) { isAlternating = false; break; } 
    }
    if (isAlternating) {
      const lastPairType = pattern[pattern.length - 1];
      return { 
        detected: true, 
        pairCount, 
        prediction: lastPairType === 'Tài' ? 'Xỉu' : 'Tài', 
        confidence: Math.min(85, 50 + pairCount * 5), 
        name: `Cầu 2-2 (${pairCount} cặp)`,
        patternId: 'cau_22' 
      };
    }
  }
  return { detected: false };
}

function analyzeCau33(results, type) {
  if (results.length < 9) return { detected: false };
  let tripleCount = 0, i = 0, pattern = [];
  while (i < results.length - 2 && tripleCount < 3) {
    if (results[i] === results[i + 1] && results[i + 1] === results[i + 2]) { 
      pattern.push(results[i]); 
      tripleCount++; 
      i += 3; 
    } else break;
  }
  if (tripleCount >= 1) {
    const lastTripleType = pattern[pattern.length - 1];
    let prediction = lastTripleType === 'Tài' ? 'Xỉu' : 'Tài';
    if (tripleCount === 1) prediction = lastTripleType;
    return { 
      detected: true, 
      tripleCount, 
      prediction: prediction, 
      confidence: Math.min(85, 50 + tripleCount * 8), 
      name: `Cầu 3-3 (${tripleCount} bộ ba)`,
      patternId: 'cau_33' 
    };
  }
  return { detected: false };
}

function analyzeCau121(results, type) {
  if (results.length < 5) return { detected: false };
  const pattern = results.slice(0, 5);
  if (pattern[0] !== pattern[1] && pattern[1] === pattern[2] && 
      pattern[2] !== pattern[3] && pattern[3] === pattern[4] &&
      pattern[0] === pattern[2] && pattern[2] === pattern[4]) {
    return { 
      detected: true, 
      pattern: '1-2-1', 
      prediction: pattern[0], 
      confidence: 70, 
      name: 'Cầu 1-2-1',
      patternId: 'cau_121' 
    };
  }
  return { detected: false };
}

function analyzeSmartBet(results, type) {
  if (results.length < 10) return { detected: false };
  const last10 = results.slice(0, 10);
  const last5 = results.slice(0, 5);
  const prev5 = results.slice(5, 10);
  const taiLast5 = last5.filter(r => r === 'Tài').length;
  const taiPrev5 = prev5.filter(r => r === 'Tài').length;
  const trendChanging = (taiLast5 >= 4 && taiPrev5 <= 1) || (taiLast5 <= 1 && taiPrev5 >= 4);
  if (trendChanging) {
    const currentDominant = taiLast5 >= 4 ? 'Tài' : 'Xỉu';
    return { 
      detected: true, 
      trendChange: true, 
      prediction: currentDominant === 'Tài' ? 'Xỉu' : 'Tài', 
      confidence: 75, 
      name: `Đảo Xu Hướng`,
      patternId: 'smart_bet' 
    };
  }
  const taiLast10 = last10.filter(r => r === 'Tài').length;
  if (taiLast10 >= 8 || taiLast10 <= 2) {
    const dominant = taiLast10 >= 8 ? 'Tài' : 'Xỉu';
    return { 
      detected: true, 
      extreme: true, 
      prediction: dominant === 'Tài' ? 'Xỉu' : 'Tài', 
      confidence: 70, 
      name: `Xu Hướng Cực`,
      patternId: 'smart_bet' 
    };
  }
  return { detected: false };
}

function analyzeDistribution(data, type) {
  const window = data.slice(0, 50);
  const taiCount = window.filter(d => d.Ket_qua === 'Tài').length;
  const xiuCount = window.length - taiCount;
  const imbalance = Math.abs(taiCount - xiuCount) / window.length;
  return { taiPercent: (taiCount / window.length) * 100, xiuPercent: (xiuCount / window.length) * 100, taiCount, xiuCount, total: window.length, imbalance };
}

function analyzeDicePatterns(data) {
  const recentData = data.slice(0, 15);
  let totalSum = 0;
  recentData.forEach(d => { totalSum += d.Tong; });
  const avgSum = totalSum / recentData.length;
  return { averageSum: avgSum };
}

function analyzeSumTrend(data) {
  const recentSums = data.slice(0, 20).map(d => d.Tong);
  let increasingCount = 0, decreasingCount = 0;
  for (let i = 0; i < recentSums.length - 1; i++) { 
    if (recentSums[i] > recentSums[i + 1]) decreasingCount++; 
    else if (recentSums[i] < recentSums[i + 1]) increasingCount++; 
  }
  const strength = Math.abs(increasingCount - decreasingCount) / (recentSums.length - 1);
  const trend = increasingCount > decreasingCount ? 'increasing' : 'decreasing';
  return { trend, strength };
}

function analyzeRecentMomentum(results) {
  const windows = [3, 5, 10, 15];
  const momentum = {};
  windows.forEach(size => {
    if (results.length >= size) {
      const window = results.slice(0, size);
      const taiCount = window.filter(r => r === 'Tài').length;
      momentum[`window_${size}`] = { taiRatio: taiCount / size, dominant: taiCount > size / 2 ? 'Tài' : 'Xỉu' };
    }
  });
  return momentum;
}

function analyzeFibonacciPattern(data, type) {
  if (data.length < 13) return { detected: false };
  const results = data.slice(0, 13).map(d => d.Ket_qua);
  const fibPositions = [0, 1, 2, 4, 7, 12];
  let fibTaiCount = 0, fibXiuCount = 0;
  fibPositions.forEach(pos => { 
    if (pos < results.length) { 
      if (results[pos] === 'Tài') fibTaiCount++; 
      else fibXiuCount++; 
    } 
  });
  if (Math.abs(fibTaiCount - fibXiuCount) >= 3) {
    const dominant = fibTaiCount > fibXiuCount ? 'Tài' : 'Xỉu';
    return { 
      detected: true, 
      prediction: dominant === 'Tài' ? 'Xỉu' : 'Tài', 
      confidence: 65, 
      name: `Fibonacci`,
      patternId: 'fibonacci' 
    };
  }
  return { detected: false };
}

function analyzeEdgeCases(data, type) {
  if (data.length < 10) return { detected: false };
  const recentTotals = data.slice(0, 10).map(d => d.Tong);
  const extremeHighCount = recentTotals.filter(t => t >= 16).length;
  const extremeLowCount = recentTotals.filter(t => t <= 5).length;
  if (extremeHighCount >= 3) return { detected: true, prediction: 'Xỉu', confidence: 65, name: 'Điểm cực cao', patternId: 'edge_cases' };
  if (extremeLowCount >= 3) return { detected: true, prediction: 'Tài', confidence: 65, name: 'Điểm cực thấp', patternId: 'edge_cases' };
  return { detected: false };
}

function loadLearningData() {
  try {
    if (fs.existsSync(LEARNING_FILE)) {
      const data = fs.readFileSync(LEARNING_FILE, 'utf8');
      const parsed = JSON.parse(data);
      Object.assign(learningData, parsed);
      console.log('Learning data loaded successfully');
    }
  } catch (error) {
    console.error('Error loading learning data:', error.message);
  }
}

function saveLearningData() {
  try {
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(learningData, null, 2));
  } catch (error) {
    console.error('Error saving learning data:', error.message);
  }
}

function loadPredictionHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(data);
      predictionHistory = parsed.history || { hu: [], md5: [] };
      lastProcessedPhien = parsed.lastProcessedPhien || { hu: null, md5: null };
      console.log('Prediction history loaded successfully');
    }
  } catch (error) {
    console.error('Error loading prediction history:', error.message);
  }
}

function savePredictionHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ history: predictionHistory, lastProcessedPhien, lastSaved: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.error('Error saving prediction history:', error.message);
  }
}

function initializePatternStats(type) {
  if (!learningData[type].patternWeights || Object.keys(learningData[type].patternWeights).length === 0) {
    learningData[type].patternWeights = { ...DEFAULT_PATTERN_WEIGHTS };
  }
  Object.keys(DEFAULT_PATTERN_WEIGHTS).forEach(pattern => {
    if (!learningData[type].patternStats[pattern]) {
      learningData[type].patternStats[pattern] = { total: 0, correct: 0, accuracy: 0.5, recentResults: [], lastAdjustment: null };
    }
  });
}

function getPatternWeight(type, patternId) {
  initializePatternStats(type);
  return learningData[type].patternWeights[patternId] || 1.0;
}

function getAdaptiveConfidenceBoost(type) {
  const recentAcc = learningData[type].recentAccuracy;
  if (recentAcc.length < 10) return 0;
  const accuracy = recentAcc.reduce((a, b) => a + b, 0) / recentAcc.length;
  if (accuracy > 0.65) return 5;
  if (accuracy > 0.55) return 2;
  if (accuracy < 0.4) return -5;
  if (accuracy < 0.45) return -2;
  return 0;
}

function getSmartPredictionAdjustment(type, prediction, allPatterns) {
  const streakInfo = learningData[type].streakAnalysis;
  if (streakInfo.currentStreak <= -5) return prediction === 'Tài' ? 'Xỉu' : 'Tài';
  return prediction;
}

function normalizeResult(result) {
  if (result === 'Tài' || result === 'tài') return 'Tài';
  if (result === 'Xỉu' || result === 'xỉu') return 'Xỉu';
  return result;
}

async function verifyPredictions(type, currentData) {
  let updated = false;
  for (const pred of learningData[type].predictions) {
    if (pred.verified) continue;
    const actualResult = currentData.find(d => d.Phien.toString() === pred.phien);
    if (actualResult) {
      pred.verified = true;
      pred.actual = actualResult.Ket_qua;
      const predictedNormalized = pred.prediction === 'Tài' || pred.prediction === 'tai' ? 'Tài' : 'Xỉu';
      pred.isCorrect = pred.actual === predictedNormalized;
      if (pred.isCorrect) {
        learningData[type].correctPredictions++;
        learningData[type].streakAnalysis.wins++;
        if (learningData[type].streakAnalysis.currentStreak >= 0) learningData[type].streakAnalysis.currentStreak++;
        else learningData[type].streakAnalysis.currentStreak = 1;
        if (learningData[type].streakAnalysis.currentStreak > learningData[type].streakAnalysis.bestStreak) 
          learningData[type].streakAnalysis.bestStreak = learningData[type].streakAnalysis.currentStreak;
      } else {
        learningData[type].streakAnalysis.losses++;
        if (learningData[type].streakAnalysis.currentStreak <= 0) learningData[type].streakAnalysis.currentStreak--;
        else learningData[type].streakAnalysis.currentStreak = -1;
        if (learningData[type].streakAnalysis.currentStreak < learningData[type].streakAnalysis.worstStreak) 
          learningData[type].streakAnalysis.worstStreak = learningData[type].streakAnalysis.currentStreak;
      }
      learningData[type].recentAccuracy.push(pred.isCorrect ? 1 : 0);
      if (learningData[type].recentAccuracy.length > 50) learningData[type].recentAccuracy.shift();
      updated = true;
    }
  }
  if (updated) {
    learningData[type].lastUpdate = new Date().toISOString();
    saveLearningData();
  }
}

function recordPrediction(type, phien, prediction, confidence, patterns) {
  const record = { 
    phien: phien.toString(), 
    prediction, 
    confidence, 
    patterns, 
    timestamp: new Date().toISOString(), 
    verified: false, 
    actual: null, 
    isCorrect: null 
  };
  learningData[type].predictions.unshift(record);
  learningData[type].totalPredictions++;
  if (learningData[type].predictions.length > 500) learningData[type].predictions = learningData[type].predictions.slice(0, 500);
  saveLearningData();
}

function savePredictionToHistory(type, phien, prediction, confidence) {
  const record = { 
    phien_hien_tai: phien.toString(), 
    du_doan: normalizeResult(prediction), 
    ti_le: `${confidence}%`, 
    id: '@tranhoang2286', 
    timestamp: new Date().toISOString() 
  };
  predictionHistory[type].unshift(record);
  if (predictionHistory[type].length > MAX_HISTORY) predictionHistory[type] = predictionHistory[type].slice(0, MAX_HISTORY);
  return record;
}

// ==================== TÍNH TOÁN DỰ ĐOÁN CHÍNH ====================
function calculateAdvancedPrediction(data, type) {
  const last50 = data.slice(0, 50);
  const results = last50.map(d => d.Ket_qua);
  initializePatternStats(type);
  
  let predictions = [];
  let allPatterns = [];

  // Chạy các thuật toán phân tích
  const cauBet = analyzeCauBet(results, type); 
  if (cauBet.detected) { 
    predictions.push({ prediction: cauBet.prediction, confidence: cauBet.confidence, priority: 10, name: cauBet.name }); 
    allPatterns.push(cauBet);
  }
  
  const cauDao11 = analyzeCauDao11(results, type); 
  if (cauDao11.detected) { 
    predictions.push({ prediction: cauDao11.prediction, confidence: cauDao11.confidence, priority: 9, name: cauDao11.name }); 
    allPatterns.push(cauDao11);
  }
  
  const cau22 = analyzeCau22(results, type); 
  if (cau22.detected) { 
    predictions.push({ prediction: cau22.prediction, confidence: cau22.confidence, priority: 8, name: cau22.name }); 
    allPatterns.push(cau22);
  }
  
  const cau33 = analyzeCau33(results, type); 
  if (cau33.detected) { 
    predictions.push({ prediction: cau33.prediction, confidence: cau33.confidence, priority: 8, name: cau33.name }); 
    allPatterns.push(cau33);
  }
  
  const cau121 = analyzeCau121(results, type); 
  if (cau121.detected) { 
    predictions.push({ prediction: cau121.prediction, confidence: cau121.confidence, priority: 7, name: cau121.name }); 
    allPatterns.push(cau121);
  }
  
  const smartBet = analyzeSmartBet(results, type); 
  if (smartBet.detected) { 
    predictions.push({ prediction: smartBet.prediction, confidence: smartBet.confidence, priority: 9, name: smartBet.name }); 
    allPatterns.push(smartBet);
  }

  const fibonacci = analyzeFibonacciPattern(last50, type);
  if (fibonacci.detected) {
    predictions.push({ prediction: fibonacci.prediction, confidence: fibonacci.confidence, priority: 7, name: fibonacci.name });
    allPatterns.push(fibonacci);
  }

  const edgeCases = analyzeEdgeCases(last50, type);
  if (edgeCases.detected) {
    predictions.push({ prediction: edgeCases.prediction, confidence: edgeCases.confidence, priority: 6, name: edgeCases.name });
    allPatterns.push(edgeCases);
  }

  // Phân bố
  const distribution = analyzeDistribution(last50, type);
  if (distribution.imbalance > 0.2) {
    const minority = distribution.taiPercent < 50 ? 'Tài' : 'Xỉu';
    predictions.push({ prediction: minority, confidence: 60, priority: 5, name: 'Phân bố lệch' });
  }

  // Dice patterns
  const dicePatterns = analyzeDicePatterns(last50);
  if (dicePatterns.averageSum > 11.5) { 
    predictions.push({ prediction: 'Xỉu', confidence: 55, priority: 4, name: 'Tổng TB cao' });
  } else if (dicePatterns.averageSum < 9.5) { 
    predictions.push({ prediction: 'Tài', confidence: 55, priority: 4, name: 'Tổng TB thấp' });
  }

  // Sum trend
  const sumTrend = analyzeSumTrend(last50);
  if (sumTrend.strength > 0.4) {
    const trendPrediction = sumTrend.trend === 'increasing' ? 'Tài' : 'Xỉu';
    predictions.push({ prediction: trendPrediction, confidence: 55, priority: 3, name: 'Xu hướng tổng' });
  }

  // Momentum
  const momentum = analyzeRecentMomentum(results);
  if (momentum.window_3 && momentum.window_10) {
    const shortTermDiff = Math.abs(momentum.window_3.taiRatio - momentum.window_10.taiRatio);
    if (shortTermDiff > 0.3) {
      const reversePrediction = momentum.window_3.dominant === 'Tài' ? 'Xỉu' : 'Tài';
      predictions.push({ prediction: reversePrediction, confidence: 55, priority: 4, name: 'Biến động ngắn hạn' });
    }
  }

  // Nếu không có dự đoán nào, dùng dự đoán mặc định
  if (predictions.length === 0) {
    const defaultPrediction = results.length > 0 ? (results[0] === 'Tài' ? 'Xỉu' : 'Tài') : 'Tài';
    predictions.push({ prediction: defaultPrediction, confidence: 50, priority: 1, name: 'Dự đoán mặc định' });
  }

  // Tính tổng hợp
  predictions.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);
  const taiVotes = predictions.filter(p => p.prediction === 'Tài');
  const xiuVotes = predictions.filter(p => p.prediction === 'Xỉu');
  const taiScore = taiVotes.reduce((sum, p) => sum + p.confidence * p.priority, 0);
  const xiuScore = xiuVotes.reduce((sum, p) => sum + p.confidence * p.priority, 0);
  
  let finalPrediction = taiScore >= xiuScore ? 'Tài' : 'Xỉu';
  finalPrediction = getSmartPredictionAdjustment(type, finalPrediction, allPatterns);
  
  let baseConfidence = 50;
  const topPredictions = predictions.slice(0, 3);
  topPredictions.forEach(p => { if (p.prediction === finalPrediction) baseConfidence += p.confidence / 10; });
  const agreementRatio = (finalPrediction === 'Tài' ? taiVotes.length : xiuVotes.length) / predictions.length;
  baseConfidence += Math.round(agreementRatio * 15);
  baseConfidence += getAdaptiveConfidenceBoost(type);
  
  let finalConfidence = Math.round(baseConfidence);
  finalConfidence = Math.max(48, Math.min(92, finalConfidence));

  return {
    prediction: finalPrediction,
    confidence: finalConfidence,
    factors: predictions.map(p => p.name),
    allPatterns: allPatterns,
    detailedAnalysis: {
      totalPatterns: predictions.length,
      taiVotes: taiVotes.length,
      xiuVotes: xiuVotes.length,
      topPattern: predictions[0]?.name || 'N/A'
    }
  };
}

async function autoProcessPredictions() {
  try {
    const dataHu = await fetchDataHu();
    if (dataHu && dataHu.length > 0) {
      const latestHuPhien = dataHu[0].Phien;
      const nextHuPhien = latestHuPhien + 1;
      if (lastProcessedPhien.hu !== nextHuPhien) {
        await verifyPredictions('hu', dataHu);
        const result = calculateAdvancedPrediction(dataHu, 'hu');
        savePredictionToHistory('hu', nextHuPhien, result.prediction, result.confidence);
        recordPrediction('hu', nextHuPhien, result.prediction, result.confidence, result.factors);
        lastProcessedPhien.hu = nextHuPhien;
        console.log(`[Auto] Hu phien ${nextHuPhien}: ${result.prediction} (${result.confidence}%)`);
      }
    }
    
    const dataMd5 = await fetchDataMd5();
    if (dataMd5 && dataMd5.length > 0) {
      const latestMd5Phien = dataMd5[0].Phien;
      const nextMd5Phien = latestMd5Phien + 1;
      if (lastProcessedPhien.md5 !== nextMd5Phien) {
        await verifyPredictions('md5', dataMd5);
        const result = calculateAdvancedPrediction(dataMd5, 'md5');
        savePredictionToHistory('md5', nextMd5Phien, result.prediction, result.confidence);
        recordPrediction('md5', nextMd5Phien, result.prediction, result.confidence, result.factors);
        lastProcessedPhien.md5 = nextMd5Phien;
        console.log(`[Auto] MD5 phien ${nextMd5Phien}: ${result.prediction} (${result.confidence}%)`);
      }
    }
    
    savePredictionHistory();
    saveLearningData();
  } catch (error) {
    console.error('[Auto] Error processing predictions:', error.message);
  }
}

function startAutoSaveTask() {
  console.log(`Auto-save task started (every ${AUTO_SAVE_INTERVAL/1000}s)`);
  setTimeout(() => autoProcessPredictions(), 5000);
  setInterval(() => autoProcessPredictions(), AUTO_SAVE_INTERVAL);
}

// ==================== API ENDPOINTS ====================
app.get('/', (req, res) => { 
  res.setHeader('Content-Type', 'text/plain; charset=utf-8'); 
  res.send('@tranhoang2286 - Luck8 Prediction API (Running on Render)'); 
});

app.get('/luck8-hu', async (req, res) => {
  try {
    const data = await fetchDataHu();
    if (!data || data.length === 0) return res.status(500).json({ error: 'Không thể lấy dữ liệu' });
    await verifyPredictions('hu', data);
    const latestPhien = data[0].Phien;
    const nextPhien = latestPhien + 1;
    const result = calculateAdvancedPrediction(data, 'hu');
    savePredictionToHistory('hu', nextPhien, result.prediction, result.confidence);
    recordPrediction('hu', nextPhien, result.prediction, result.confidence, result.factors);
    res.json({ 
      phien_hien_tai: nextPhien.toString(), 
      du_doan: normalizeResult(result.prediction), 
      ti_le: `${result.confidence}%`, 
      id: '@tranhoang2286' 
    });
  } catch (error) { 
    console.error('Error:', error); 
    res.status(500).json({ error: 'Lỗi server' }); 
  }
});

app.get('/luck8-md5', async (req, res) => {
  try {
    const data = await fetchDataMd5();
    if (!data || data.length === 0) return res.status(500).json({ error: 'Không thể lấy dữ liệu' });
    await verifyPredictions('md5', data);
    const latestPhien = data[0].Phien;
    const nextPhien = latestPhien + 1;
    const result = calculateAdvancedPrediction(data, 'md5');
    savePredictionToHistory('md5', nextPhien, result.prediction, result.confidence);
    recordPrediction('md5', nextPhien, result.prediction, result.confidence, result.factors);
    res.json({ 
      phien_hien_tai: nextPhien.toString(), 
      du_doan: normalizeResult(result.prediction), 
      ti_le: `${result.confidence}%`, 
      id: '@tranhoang2286' 
    });
  } catch (error) { 
    console.error('Error:', error); 
    res.status(500).json({ error: 'Lỗi server' }); 
  }
});

app.get('/luck8-hu/lichsu', async (req, res) => {
  try {
    const data = await fetchDataHu();
    if (data && data.length > 0) await verifyPredictions('hu', data);
    const historyWithStatus = predictionHistory.hu.map(record => {
      const prediction = learningData.hu.predictions.find(p => p.phien === record.phien_hien_tai);
      return { ...record, ket_qua_thuc_te: prediction?.actual || null, status: prediction?.verified ? (prediction.isCorrect ? '✅' : '❌') : null };
    });
    res.json({ type: 'Luck8 - Tài Xỉu Hũ', history: historyWithStatus, total: historyWithStatus.length });
  } catch (error) { 
    res.json({ type: 'Luck8 - Tài Xỉu Hũ', history: predictionHistory.hu, total: predictionHistory.hu.length }); 
  }
});

app.get('/luck8-md5/lichsu', async (req, res) => {
  try {
    const data = await fetchDataMd5();
    if (data && data.length > 0) await verifyPredictions('md5', data);
    const historyWithStatus = predictionHistory.md5.map(record => {
      const prediction = learningData.md5.predictions.find(p => p.phien === record.phien_hien_tai);
      return { ...record, ket_qua_thuc_te: prediction?.actual || null, status: prediction?.verified ? (prediction.isCorrect ? '✅' : '❌') : null };
    });
    res.json({ type: 'Luck8 - Tài Xỉu MD5', history: historyWithStatus, total: historyWithStatus.length });
  } catch (error) { 
    res.json({ type: 'Luck8 - Tài Xỉu MD5', history: predictionHistory.md5, total: predictionHistory.md5.length }); 
  }
});

app.get('/luck8-hu/analysis', async (req, res) => {
  try {
    const data = await fetchDataHu();
    if (!data || data.length === 0) return res.status(500).json({ error: 'Không thể lấy dữ liệu' });
    await verifyPredictions('hu', data);
    const result = calculateAdvancedPrediction(data, 'hu');
    res.json({ 
      prediction: normalizeResult(result.prediction), 
      confidence: result.confidence, 
      factors: result.factors, 
      analysis: result.detailedAnalysis 
    });
  } catch (error) { 
    res.status(500).json({ error: 'Lỗi server' }); 
  }
});

app.get('/luck8-md5/analysis', async (req, res) => {
  try {
    const data = await fetchDataMd5();
    if (!data || data.length === 0) return res.status(500).json({ error: 'Không thể lấy dữ liệu' });
    await verifyPredictions('md5', data);
    const result = calculateAdvancedPrediction(data, 'md5');
    res.json({ 
      prediction: normalizeResult(result.prediction), 
      confidence: result.confidence, 
      factors: result.factors, 
      analysis: result.detailedAnalysis 
    });
  } catch (error) { 
    res.status(500).json({ error: 'Lỗi server' }); 
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ==================== KHỞI ĐỘNG SERVER ====================
async function initializeCache() {
  console.log('Initializing data cache...');
  await fetchDataHu();
  await fetchDataMd5();
  console.log(`Cache initialized: HU (${historicalDataCache.hu.length}), MD5 (${historicalDataCache.md5.length})`);
}

loadLearningData();
loadPredictionHistory();

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`========================================`);
  console.log(`[🌐] Server running on port ${PORT}`);
  console.log(`[🤖] Luck8 Prediction API Ready`);
  console.log(`[🆔] Author: @tranhoang2286`);
  console.log(`[📊] Status: ONLINE`);
  console.log(`========================================`);
  console.log('API Endpoints:');
  console.log('  GET /luck8-hu - Dự đoán Tài Xỉu Hũ');
  console.log('  GET /luck8-md5 - Dự đoán Tài Xỉu MD5');
  console.log('  GET /luck8-hu/lichsu - Lịch sử Hũ');
  console.log('  GET /luck8-md5/lichsu - Lịch sử MD5');
  console.log('  GET /luck8-hu/analysis - Phân tích Hũ');
  console.log('  GET /luck8-md5/analysis - Phân tích MD5');
  console.log('  GET /health - Health check');
  console.log(`========================================`);
  
  await initializeCache();
  startAutoSaveTask();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, closing server...');
  savePredictionHistory();
  saveLearningData();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  savePredictionHistory();
  saveLearningData();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
