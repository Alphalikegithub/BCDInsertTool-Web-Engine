import { RocketConfig } from '../types';

export const PRECONFIGURED_ROCKETS: RocketConfig[] = [
  {
    name: "CZ12遥测一级",
    childLen: 256,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "CZ12遥测二级",
    childLen: 320,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "CZ8A遥测一级",
    childLen: 120,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "CZ8A遥测二级",
    childLen: 240,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "长征八遥测一级",
    childLen: 120,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "长征八遥测二级",
    childLen: 240,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "带时标的遥测原码文件",
    childLen: 328,
    viceLen: 64,
    frameIntervalMs: 25.0,
    baseTime: "2000-01-01 00:00:00.000"
  },
  {
    name: "CZ8A-天基",
    childLen: 896,
    viceLen: 1,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  },
  {
    name: "CZ8A-天基浏览原码-905字节",
    childLen: 905,
    viceLen: 1,
    frameIntervalMs: 25.0,
    baseTime: "2025-11-10 10:41:30.841"
  }
];
