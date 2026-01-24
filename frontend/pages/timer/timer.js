// pages/timer/timer.js
const api = require('../../utils/api.js')

Page({
  data: {
    isWearing: false,
    sessionId: null,
    startTime: null,
    todayTotal: 0,        // 今日累计秒数
    targetSeconds: 79200, // 目标秒数 (22小时)
    displayTime: '00:00:00',
    progressPercent: 0,
    currentStreak: 0,
    statusText: '点击开始佩戴',
    loading: true
  },

  timer: null,

  onLoad() {
    this.checkLoginAndLoadStatus()
  },

  onShow() {
    if (!this.data.loading) {
      this.loadTimerStatus()
    }
  },

  onHide() {
    this.stopDisplayTimer()
  },

  onUnload() {
    this.stopDisplayTimer()
  },

  // 检查登录状态并加载数据
  async checkLoginAndLoadStatus() {
    const token = api.getToken()
    if (!token) {
      await this.doLogin()
    }
    await this.loadTimerStatus()
    await this.loadAchievements()
    this.setData({ loading: false })
  },

  // 微信登录
  async doLogin() {
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })
      
      const result = await api.login(loginRes.code)
      api.setToken(result.token)
      
      if (result.is_new_user) {
        wx.showToast({
          title: '欢迎使用！',
          icon: 'success'
        })
      }
    } catch (err) {
      console.error('登录失败:', err)
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    }
  },

  // 加载计时状态
  async loadTimerStatus() {
    try {
      const status = await api.timer.getStatus()
      
      this.setData({
        isWearing: status.is_wearing,
        sessionId: status.session_id,
        startTime: status.start_time ? new Date(status.start_time) : null,
        todayTotal: status.today_total,
        targetSeconds: status.target_seconds,
        statusText: status.is_wearing ? '佩戴中，点击停止' : '点击开始佩戴'
      })
      
      this.updateDisplay()
      
      if (status.is_wearing) {
        this.startDisplayTimer()
      }
    } catch (err) {
      console.error('加载状态失败:', err)
      // 如果API失败，使用本地数据
      this.loadLocalStatus()
    }
  },

  // 加载本地状态（离线模式）
  loadLocalStatus() {
    const localState = wx.getStorageSync('timer_state') || {}
    const today = this.getTodayDate()
    
    // 检查是否跨日
    if (localState.lastUpdateDate && localState.lastUpdateDate !== today) {
      // 归档昨日数据
      this.archiveYesterdayData(localState)
      localState.todayTotal = 0
      localState.lastUpdateDate = today
    }
    
    this.setData({
      isWearing: localState.isWearing || false,
      startTime: localState.startTime ? new Date(localState.startTime) : null,
      todayTotal: localState.todayTotal || 0,
      statusText: localState.isWearing ? '佩戴中，点击停止' : '点击开始佩戴'
    })
    
    this.updateDisplay()
    
    if (localState.isWearing) {
      this.startDisplayTimer()
    }
  },

  // 归档昨日数据
  archiveYesterdayData(state) {
    if (!state.lastUpdateDate) return
    
    const records = wx.getStorageSync('daily_records') || []
    const existingIndex = records.findIndex(r => r.date === state.lastUpdateDate)
    
    const record = {
      date: state.lastUpdateDate,
      totalSeconds: state.todayTotal || 0,
      completed: (state.todayTotal || 0) >= this.data.targetSeconds
    }
    
    if (existingIndex >= 0) {
      records[existingIndex] = record
    } else {
      records.push(record)
    }
    
    wx.setStorageSync('daily_records', records)
  },

  // 加载成就数据
  async loadAchievements() {
    try {
      const achievements = await api.stats.achievements()
      this.setData({
        currentStreak: achievements.current_streak
      })
    } catch (err) {
      console.error('加载成就失败:', err)
    }
  },

  // 开始/停止按钮点击
  async onToggleTimer() {
    if (this.data.loading) return
    
    if (this.data.isWearing) {
      await this.stopTimer()
    } else {
      await this.startTimer()
    }
  },

  // 开始计时
  async startTimer() {
    const startTime = new Date()
    
    try {
      const result = await api.timer.start(startTime.toISOString())
      
      this.setData({
        isWearing: true,
        sessionId: result.session_id,
        startTime: startTime,
        statusText: '佩戴中，点击停止'
      })
      
      this.startDisplayTimer()
      
      // 保存本地状态
      this.saveLocalState()
      
      wx.showToast({
        title: '开始计时',
        icon: 'success'
      })
    } catch (err) {
      console.error('开始计时失败:', err)
      // 离线模式：直接本地计时
      this.setData({
        isWearing: true,
        startTime: startTime,
        statusText: '佩戴中，点击停止'
      })
      this.startDisplayTimer()
      this.saveLocalState()
    }
  },

  // 停止计时
  async stopTimer() {
    const endTime = new Date()
    
    this.stopDisplayTimer()
    
    // 计算本次时长
    const duration = Math.floor((endTime - this.data.startTime) / 1000)
    const newTotal = this.data.todayTotal + duration
    
    try {
      if (this.data.sessionId) {
        await api.timer.stop(this.data.sessionId, endTime.toISOString())
      }
    } catch (err) {
      console.error('停止计时API失败:', err)
    }
    
    this.setData({
      isWearing: false,
      sessionId: null,
      startTime: null,
      todayTotal: newTotal,
      statusText: '点击开始佩戴'
    })
    
    this.updateDisplay()
    this.saveLocalState()
    
    // 检查是否达标
    if (newTotal >= this.data.targetSeconds) {
      wx.showToast({
        title: '今日目标已达成！',
        icon: 'success'
      })
    } else {
      const remaining = this.data.targetSeconds - newTotal
      const hours = Math.floor(remaining / 3600)
      const mins = Math.floor((remaining % 3600) / 60)
      wx.showToast({
        title: `还需佩戴${hours}小时${mins}分钟`,
        icon: 'none'
      })
    }
  },

  // 启动显示更新定时器
  startDisplayTimer() {
    this.stopDisplayTimer()
    this.timer = setInterval(() => {
      this.updateDisplay()
    }, 1000)
  },

  // 停止显示更新定时器
  stopDisplayTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  // 更新显示
  updateDisplay() {
    let totalSeconds = this.data.todayTotal
    
    // 如果正在计时，加上当前进行的时长
    if (this.data.isWearing && this.data.startTime) {
      const currentDuration = Math.floor((new Date() - this.data.startTime) / 1000)
      totalSeconds += currentDuration
    }
    
    // 格式化时间显示
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    
    const displayTime = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`
    
    // 计算进度百分比
    const progressPercent = Math.min(100, Math.round(totalSeconds / this.data.targetSeconds * 100))
    
    this.setData({
      displayTime,
      progressPercent
    })
  },

  // 数字补零
  padZero(num) {
    return num < 10 ? '0' + num : '' + num
  },

  // 获取今天日期
  getTodayDate() {
    const now = new Date()
    return `${now.getFullYear()}-${this.padZero(now.getMonth() + 1)}-${this.padZero(now.getDate())}`
  },

  // 保存本地状态
  saveLocalState() {
    const state = {
      isWearing: this.data.isWearing,
      startTime: this.data.startTime ? this.data.startTime.toISOString() : null,
      todayTotal: this.data.todayTotal,
      lastUpdateDate: this.getTodayDate()
    }
    wx.setStorageSync('timer_state', state)
  }
})
