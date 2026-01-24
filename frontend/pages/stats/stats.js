// pages/stats/stats.js
const api = require('../../utils/api.js')

Page({
  data: {
    weekData: [],
    avgHours: 0,
    completionRate: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalCompletedDays: 0,
    suggestions: [],
    weekOffset: 0,
    weekLabel: '本周',
    loading: true,
    targetHours: 22
  },

  onLoad() {
    this.loadWeeklyStats()
  },

  onShow() {
    if (!this.data.loading) {
      this.loadWeeklyStats()
    }
  },

  // 加载周统计
  async loadWeeklyStats() {
    this.setData({ loading: true })
    
    try {
      const stats = await api.stats.weekly(this.data.weekOffset)
      
      this.setData({
        weekData: stats.week_data,
        avgHours: stats.avg_hours,
        completionRate: stats.completion_rate,
        currentStreak: stats.current_streak,
        longestStreak: stats.longest_streak,
        totalCompletedDays: stats.total_completed_days,
        suggestions: stats.suggestions,
        loading: false
      })
      
      // 获取目标时长
      this.loadTargetHours()
    } catch (err) {
      console.error('加载统计失败:', err)
      this.loadLocalStats()
    }
  },

  // 加载目标时长
  async loadTargetHours() {
    try {
      const plan = await api.plan.get()
      this.setData({
        targetHours: plan.target_hours || 22
      })
    } catch (err) {
      const localPlan = wx.getStorageSync('user_plan') || {}
      this.setData({
        targetHours: localPlan.targetHours || 22
      })
    }
  },

  // 加载本地统计
  loadLocalStats() {
    const records = wx.getStorageSync('daily_records') || []
    const localPlan = wx.getStorageSync('user_plan') || {}
    const targetHours = localPlan.targetHours || 22
    
    // 计算本周数据
    const weekData = this.calculateWeekData(records, targetHours)
    
    // 计算统计数据
    const totalHours = weekData.reduce((sum, d) => sum + d.hours, 0)
    const completedDays = weekData.filter(d => d.completed).length
    
    // 计算连续天数
    const { currentStreak, longestStreak } = this.calculateStreak(records)
    const totalCompletedDays = records.filter(r => r.completed).length
    
    // 生成建议
    const suggestions = this.generateSuggestions(weekData, targetHours)
    
    this.setData({
      weekData: weekData,
      avgHours: (totalHours / 7).toFixed(1),
      completionRate: (completedDays / 7 * 100).toFixed(1),
      currentStreak: currentStreak,
      longestStreak: longestStreak,
      totalCompletedDays: totalCompletedDays,
      suggestions: suggestions,
      targetHours: targetHours,
      loading: false
    })
  },

  // 计算周数据
  calculateWeekData(records, targetHours) {
    const weekData = []
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1 + (this.data.weekOffset * 7))
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const dateStr = this.formatDate(date)
      
      const record = records.find(r => r.date === dateStr)
      const hours = record ? (record.totalSeconds / 3600).toFixed(1) : 0
      const completed = record ? record.completed : false
      
      weekData.push({
        date: dateStr,
        hours: parseFloat(hours),
        completed: completed,
        dayLabel: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i]
      })
    }
    
    return weekData
  },

  // 计算连续天数
  calculateStreak(records) {
    if (!records.length) return { currentStreak: 0, longestStreak: 0 }
    
    const sorted = records.sort((a, b) => b.date.localeCompare(a.date))
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    
    for (const record of sorted) {
      if (record.completed) {
        tempStreak++
        if (tempStreak > longestStreak) longestStreak = tempStreak
      } else {
        if (tempStreak > 0 && currentStreak === 0) {
          currentStreak = tempStreak
        }
        tempStreak = 0
      }
    }
    
    if (currentStreak === 0 && tempStreak > 0) {
      currentStreak = tempStreak
    }
    
    return { currentStreak, longestStreak }
  },

  // 生成建议
  generateSuggestions(weekData, targetHours) {
    const suggestions = []
    
    if (!weekData.length) {
      suggestions.push('开始记录你的佩戴时间吧！')
      return suggestions
    }
    
    // 找出最短的一天
    const validDays = weekData.filter(d => d.hours > 0)
    if (validDays.length) {
      const minDay = validDays.reduce((min, d) => d.hours < min.hours ? d : min)
      if (minDay.hours < targetHours * 0.8) {
        suggestions.push(`${minDay.dayLabel}的佩戴时间较短，建议加强`)
      }
    }
    
    // 检查未达标天数
    const uncompletedDays = weekData.filter(d => !d.completed && d.hours > 0)
    if (uncompletedDays.length >= 3) {
      suggestions.push('最近多天未达标，需要加油哦～')
    }
    
    // 全部达标
    const completedDays = weekData.filter(d => d.completed)
    if (completedDays.length === 7) {
      suggestions.push('太棒了！本周完美达成目标！')
    }
    
    if (!suggestions.length) {
      suggestions.push('继续保持，你做得很好！')
    }
    
    return suggestions
  },

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 上一周
  onPrevWeek() {
    this.setData({
      weekOffset: this.data.weekOffset - 1,
      weekLabel: this.getWeekLabel(this.data.weekOffset - 1)
    })
    this.loadWeeklyStats()
  },

  // 下一周
  onNextWeek() {
    if (this.data.weekOffset >= 0) return
    
    this.setData({
      weekOffset: this.data.weekOffset + 1,
      weekLabel: this.getWeekLabel(this.data.weekOffset + 1)
    })
    this.loadWeeklyStats()
  },

  // 获取周标签
  getWeekLabel(offset) {
    if (offset === 0) return '本周'
    if (offset === -1) return '上周'
    return `${Math.abs(offset)}周前`
  },

  // 分享周报
  onShareReport() {
    wx.showToast({
      title: '生成周报中...',
      icon: 'loading'
    })
    
    // TODO: 实现Canvas绘制周报图片
    setTimeout(() => {
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
      })
    }, 1000)
  }
})
