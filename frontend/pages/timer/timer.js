// pages/timer/timer.js
const api = require('../../utils/api.js')

Page({
  data: {
    isWearing: false,
    sessionId: null,
    startTime: null,       // 服务器返回的开始时间
    serverTimeOffset: 0,   // 本地时间与服务器时间的偏移量（毫秒）
    todayTotal: 0,         // 今日累计秒数（已完成的会话）
    targetSeconds: 79200,  // 目标秒数 (22小时)
    displayTime: '00:00:00',
    progressPercent: 0,
    currentStreak: 0,
    statusText: '点击开始佩戴',
    loading: true,
    offline: false,        // 是否离线模式
    lastSyncTime: null     // 上次同步时间
  },

  timer: null,
  syncTimer: null,  // 定期同步定时器

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
    this.stopSyncTimer()
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

  // 加载计时状态（从服务器）
  async loadTimerStatus() {
    try {
      const status = await api.timer.getStatus()
      
      // 计算服务器时间与本地时间的偏移
      const serverTime = new Date(status.server_time)
      const localTime = new Date()
      const offset = serverTime.getTime() - localTime.getTime()
      
      this.setData({
        isWearing: status.is_wearing,
        sessionId: status.session_id,
        startTime: status.start_time ? new Date(status.start_time) : null,
        serverTimeOffset: offset,
        todayTotal: status.today_total,
        targetSeconds: status.target_seconds,
        statusText: status.is_wearing ? '佩戴中，点击停止' : '点击开始佩戴',
        offline: false,
        lastSyncTime: new Date()
      })
      
      // 保存到本地缓存（仅作为显示备份）
      this.saveLocalCache()
      
      this.updateDisplay()
      
      if (status.is_wearing) {
        this.startDisplayTimer()
        this.startSyncTimer()  // 计时中定期同步
      } else {
        this.stopSyncTimer()
      }
    } catch (err) {
      console.error('加载状态失败:', err)
      this.handleOfflineMode()
    }
  },

  // 处理离线模式
  handleOfflineMode() {
    const cache = wx.getStorageSync('timer_cache') || {}
    
    this.setData({
      offline: true,
      isWearing: cache.isWearing || false,
      startTime: cache.startTime ? new Date(cache.startTime) : null,
      todayTotal: cache.todayTotal || 0,
      statusText: cache.isWearing ? '佩戴中（离线）' : '服务器连接失败'
    })
    
    this.updateDisplay()
    
    if (cache.isWearing) {
      this.startDisplayTimer()
    }
    
    wx.showToast({
      title: '无法连接服务器',
      icon: 'none',
      duration: 2000
    })
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
    
    // 离线模式下禁止操作
    if (this.data.offline) {
      wx.showModal({
        title: '无法操作',
        content: '当前处于离线模式，请检查网络连接后重试',
        showCancel: false
      })
      // 尝试重新连接
      this.loadTimerStatus()
      return
    }
    
    if (this.data.isWearing) {
      await this.stopTimer()
    } else {
      await this.startTimer()
    }
  },

  // 开始计时（时间由服务器决定）
  async startTimer() {
    try {
      wx.showLoading({ title: '开始计时...' })
      
      const result = await api.timer.start()
      
      wx.hideLoading()
      
      // 使用服务器返回的时间
      const serverStartTime = new Date(result.start_time)
      const serverTime = new Date(result.server_time)
      const localTime = new Date()
      const offset = serverTime.getTime() - localTime.getTime()
      
      this.setData({
        isWearing: true,
        sessionId: result.session_id,
        startTime: serverStartTime,
        serverTimeOffset: offset,
        statusText: '佩戴中，点击停止',
        offline: false
      })
      
      this.startDisplayTimer()
      this.startSyncTimer()
      this.saveLocalCache()
      
      wx.showToast({
        title: '开始计时',
        icon: 'success'
      })
    } catch (err) {
      wx.hideLoading()
      console.error('开始计时失败:', err)
      
      let message = '开始计时失败'
      if (err.message && err.message.includes('已有进行中')) {
        message = '已有进行中的计时'
        // 重新同步状态
        this.loadTimerStatus()
      }
      
      wx.showToast({
        title: message,
        icon: 'none'
      })
    }
  },

  // 停止计时（时间由服务器决定）
  async stopTimer() {
    if (!this.data.sessionId) {
      wx.showToast({
        title: '无有效会话',
        icon: 'none'
      })
      return
    }
    
    try {
      wx.showLoading({ title: '停止计时...' })
      
      this.stopDisplayTimer()
      this.stopSyncTimer()
      
      const result = await api.timer.stop(this.data.sessionId)
      
      wx.hideLoading()
      
      // 使用服务器返回的数据
      this.setData({
        isWearing: false,
        sessionId: null,
        startTime: null,
        todayTotal: result.today_total,
        statusText: '点击开始佩戴'
      })
      
      this.updateDisplay()
      this.saveLocalCache()
      
      // 显示结果
      if (result.completed) {
        wx.showToast({
          title: '今日目标已达成！',
          icon: 'success'
        })
      } else {
        const remaining = this.data.targetSeconds - result.today_total
        const hours = Math.floor(remaining / 3600)
        const mins = Math.floor((remaining % 3600) / 60)
        wx.showToast({
          title: `本次${Math.floor(result.duration / 60)}分钟，还需${hours}时${mins}分`,
          icon: 'none',
          duration: 3000
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('停止计时失败:', err)
      
      // 如果是超时错误，说明会话已被服务器自动关闭
      if (err.message && err.message.includes('超过')) {
        wx.showModal({
          title: '计时异常',
          content: err.message,
          showCancel: false
        })
        this.loadTimerStatus()  // 重新同步
        return
      }
      
      wx.showToast({
        title: '停止失败，请重试',
        icon: 'none'
      })
      
      // 恢复计时显示
      this.startDisplayTimer()
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

  // 启动定期同步定时器（每30秒同步一次）
  startSyncTimer() {
    this.stopSyncTimer()
    this.syncTimer = setInterval(() => {
      this.syncWithServer()
    }, 30000)
  },

  // 停止同步定时器
  stopSyncTimer() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  },

  // 与服务器同步状态
  async syncWithServer() {
    try {
      const status = await api.timer.getStatus()
      
      // 更新服务器时间偏移
      const serverTime = new Date(status.server_time)
      const localTime = new Date()
      const offset = serverTime.getTime() - localTime.getTime()
      
      this.setData({
        serverTimeOffset: offset,
        todayTotal: status.today_total,
        lastSyncTime: new Date()
      })
      
      // 检查服务器状态与本地是否一致
      if (status.is_wearing !== this.data.isWearing) {
        console.warn('状态不一致，重新同步')
        this.loadTimerStatus()
      }
      
      this.saveLocalCache()
    } catch (err) {
      console.error('同步失败:', err)
    }
  },

  // 更新显示（使用校准后的时间）
  updateDisplay() {
    let totalSeconds = this.data.todayTotal
    
    // 如果正在计时，计算当前进行的时长
    if (this.data.isWearing && this.data.startTime) {
      // 使用校准后的当前时间
      const calibratedNow = new Date(Date.now() + this.data.serverTimeOffset)
      const currentDuration = Math.floor((calibratedNow - this.data.startTime) / 1000)
      
      // 防止负数（时钟误差）
      if (currentDuration > 0) {
        totalSeconds += currentDuration
      }
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

  // 保存本地缓存（仅作为显示备份）
  saveLocalCache() {
    const cache = {
      isWearing: this.data.isWearing,
      sessionId: this.data.sessionId,
      startTime: this.data.startTime ? this.data.startTime.toISOString() : null,
      todayTotal: this.data.todayTotal,
      targetSeconds: this.data.targetSeconds,
      serverTimeOffset: this.data.serverTimeOffset,
      lastUpdateDate: this.getTodayDate(),
      lastSyncTime: new Date().toISOString()
    }
    wx.setStorageSync('timer_cache', cache)
  }
})
