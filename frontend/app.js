// app.js
const api = require('./utils/api.js')

App({
  onLaunch() {
    // 检查登录状态
    this.checkLogin()
    
    // 检查跨日数据归档
    this.checkDateChange()
  },

  onShow() {
    // 每次显示时检查日期变化
    this.checkDateChange()
  },

  // 检查登录状态
  async checkLogin() {
    const token = api.getToken()
    if (!token) {
      // 未登录，进行微信登录
      try {
        const loginRes = await new Promise((resolve, reject) => {
          wx.login({
            success: resolve,
            fail: reject
          })
        })
        
        const result = await api.login(loginRes.code)
        api.setToken(result.token)
        this.globalData.userId = result.user_id
        this.globalData.isNewUser = result.is_new_user
      } catch (err) {
        console.error('登录失败:', err)
      }
    }
  },

  // 检查日期变化，归档昨日数据
  checkDateChange() {
    const timerState = wx.getStorageSync('timer_state') || {}
    const today = this.getTodayDate()
    
    if (timerState.lastUpdateDate && timerState.lastUpdateDate !== today) {
      // 日期已变化，归档昨日数据
      this.archiveData(timerState)
      
      // 重置今日数据
      timerState.todayTotal = 0
      timerState.lastUpdateDate = today
      
      // 如果正在计时，处理跨日时段
      if (timerState.isWearing && timerState.startTime) {
        const startTime = new Date(timerState.startTime)
        const midnight = new Date(today)
        midnight.setHours(0, 0, 0, 0)
        
        // 昨日部分已在archiveData中处理
        // 今日部分从零点开始
        timerState.startTime = midnight.toISOString()
      }
      
      wx.setStorageSync('timer_state', timerState)
    }
  },

  // 归档数据到daily_records
  archiveData(timerState) {
    if (!timerState.lastUpdateDate) return
    
    const records = wx.getStorageSync('daily_records') || []
    const existingIndex = records.findIndex(r => r.date === timerState.lastUpdateDate)
    
    // 计算昨日总时长
    let totalSeconds = timerState.todayTotal || 0
    
    // 如果正在计时，加上跨日的部分
    if (timerState.isWearing && timerState.startTime) {
      const startTime = new Date(timerState.startTime)
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      totalSeconds += Math.floor((midnight - startTime) / 1000)
    }
    
    const plan = wx.getStorageSync('user_plan') || {}
    const targetSeconds = (plan.targetHours || 22) * 3600
    
    const record = {
      date: timerState.lastUpdateDate,
      totalSeconds: totalSeconds,
      completed: totalSeconds >= targetSeconds
    }
    
    if (existingIndex >= 0) {
      records[existingIndex] = record
    } else {
      records.push(record)
    }
    
    // 只保留最近90天的记录
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const cutoffDate = this.formatDate(ninetyDaysAgo)
    
    const filteredRecords = records.filter(r => r.date >= cutoffDate)
    wx.setStorageSync('daily_records', filteredRecords)
  },

  // 获取今天日期
  getTodayDate() {
    return this.formatDate(new Date())
  },

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  globalData: {
    userInfo: null,
    userId: null,
    isNewUser: false
  }
})
