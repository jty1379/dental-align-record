// pages/profile/profile.js
const api = require('../../utils/api.js')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    // 成就数据
    totalDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalHours: 0,
    completionRate: 0,
    // 徽章
    badges: [],
    // 计划信息
    currentSet: 1,
    totalSets: 30,
    loading: true
  },

  onLoad() {
    this.loadUserInfo()
    this.loadAllData()
  },

  onShow() {
    if (!this.data.loading) {
      this.loadAchievements()
    }
  },

  // 加载本地存储的用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    if (userInfo.avatarUrl || userInfo.nickName) {
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
    }
  },

  async loadAllData() {
    await this.loadAchievements()
    await this.loadPlanInfo()
    this.setData({ loading: false })
  },

  // 加载成就数据
  async loadAchievements() {
    try {
      const data = await api.stats.achievements()
      
      // 计算徽章
      const badges = this.calculateBadges(data)
      
      this.setData({
        totalDays: data.total_days || 0,
        currentStreak: data.current_streak || 0,
        longestStreak: data.longest_streak || 0,
        totalHours: Math.floor((data.total_seconds || 0) / 3600),
        completionRate: data.completion_rate || 0,
        badges
      })
    } catch (err) {
      console.error('加载成就失败:', err)
    }
  },

  // 加载计划信息
  async loadPlanInfo() {
    try {
      const plan = await api.plan.get()
      this.setData({
        currentSet: plan.current_set || 1,
        totalSets: plan.total_sets || 30
      })
    } catch (err) {
      console.error('加载计划失败:', err)
    }
  },

  // 计算徽章
  calculateBadges(data) {
    const badges = []
    
    // 连续打卡徽章
    if (data.current_streak >= 7) {
      badges.push({ name: '周冠军', icon: 'trophy', desc: '连续7天达标' })
    }
    if (data.current_streak >= 30) {
      badges.push({ name: '月度之星', icon: 'star', desc: '连续30天达标' })
    }
    if (data.longest_streak >= 100) {
      badges.push({ name: '百日成就', icon: 'medal', desc: '连续100天达标' })
    }
    
    // 累计时长徽章
    const totalHours = (data.total_seconds || 0) / 3600
    if (totalHours >= 100) {
      badges.push({ name: '百小时', icon: 'clock', desc: '累计佩戴100小时' })
    }
    if (totalHours >= 500) {
      badges.push({ name: '五百小时', icon: 'clock-gold', desc: '累计佩戴500小时' })
    }
    
    // 达标率徽章
    if (data.completion_rate >= 90) {
      badges.push({ name: '优秀学员', icon: 'excellent', desc: '达标率90%以上' })
    }
    
    return badges
  },

  // 选择头像（微信新API）
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    const userInfo = this.data.userInfo || {}
    userInfo.avatarUrl = avatarUrl
    this.setData({
      userInfo: userInfo,
      hasUserInfo: true
    })
    wx.setStorageSync('userInfo', userInfo)
  },

  // 输入昵称
  onNicknameInput(e) {
    const nickName = e.detail.value
    if (nickName) {
      const userInfo = this.data.userInfo || {}
      userInfo.nickName = nickName
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
      wx.setStorageSync('userInfo', userInfo)
    }
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '确认清除',
      content: '将清除本地缓存数据，云端数据不受影响',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync()
          wx.showToast({
            title: '缓存已清除',
            icon: 'success'
          })
        }
      }
    })
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          api.clearToken()
          wx.clearStorageSync()
          wx.reLaunch({
            url: '/pages/timer/timer'
          })
        }
      }
    })
  },

  // 关于页面
  showAbout() {
    wx.showModal({
      title: '关于',
      content: '牙套佩戴记录 v1.0.0\n帮助你养成良好的佩戴习惯',
      showCancel: false
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '牙套佩戴记录 - 养成好习惯',
      path: '/pages/timer/timer'
    }
  }
})
