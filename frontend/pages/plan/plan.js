// pages/plan/plan.js
const api = require('../../utils/api.js')

Page({
  data: {
    totalSets: 30,
    daysPerSet: 14,
    currentSet: 1,
    targetHours: 22,
    nightStartTime: '22:00',
    nightEndTime: '07:00',
    startDate: '',
    daysWorn: 0,
    currentSetDay: 1,
    loading: true,
    progressPercent: 3,
    remainingDays: 406,
    
    // picker选项
    totalSetsRange: Array.from({length: 50}, (_, i) => i + 1),
    daysPerSetRange: Array.from({length: 21}, (_, i) => i + 7),
    targetHoursRange: Array.from({length: 24}, (_, i) => i + 1)
  },

  onLoad() {
    this.loadPlan()
  },

  onShow() {
    if (!this.data.loading) {
      this.loadPlan()
    }
  },

  // 加载计划
  async loadPlan() {
    try {
      const plan = await api.plan.get()
      
      this.setData({
        totalSets: plan.total_sets,
        daysPerSet: plan.days_per_set,
        currentSet: plan.current_set,
        targetHours: plan.target_hours,
        nightStartTime: plan.night_start_time || '22:00',
        nightEndTime: plan.night_end_time || '07:00',
        startDate: plan.start_date || '',
        daysWorn: plan.days_worn || 0,
        currentSetDay: plan.current_set_day || 1,
        loading: false
      })
      this.updateCalculatedValues()
    } catch (err) {
      console.error('加载计划失败:', err)
      this.loadLocalPlan()
    }
  },

  // 加载本地计划
  loadLocalPlan() {
    const plan = wx.getStorageSync('user_plan') || {}
    
    this.setData({
      totalSets: plan.totalSets || 30,
      daysPerSet: plan.daysPerSet || 14,
      currentSet: plan.currentSet || 1,
      targetHours: plan.targetHours || 22,
      nightStartTime: plan.nightStartTime || '22:00',
      nightEndTime: plan.nightEndTime || '07:00',
      startDate: plan.startDate || '',
      loading: false
    })
    
    this.calculateDaysWorn()
  },

  // 计算已佩戴天数
  calculateDaysWorn() {
    if (!this.data.startDate) {
      this.setData({ daysWorn: 0, currentSetDay: 1 })
      this.updateCalculatedValues()
      return
    }
    
    const start = new Date(this.data.startDate)
    const now = new Date()
    const diffTime = Math.abs(now - start)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    let currentSetDay = diffDays % this.data.daysPerSet
    if (currentSetDay === 0) currentSetDay = this.data.daysPerSet
    
    this.setData({
      daysWorn: diffDays,
      currentSetDay: currentSetDay
    })
    this.updateCalculatedValues()
  },

  // 更新计算值（WXML不支持直接调用JS方法）
  updateCalculatedValues() {
    const progressPercent = Math.round(this.data.currentSet / this.data.totalSets * 100)
    const remainingDays = (this.data.totalSets - this.data.currentSet) * this.data.daysPerSet
    this.setData({
      progressPercent: progressPercent,
      remainingDays: remainingDays
    })
  },

  // 保存计划（自动触发，静默保存）
  async savePlan(showToast) {
    // 处理 bindtap 传入 event 对象的情况
    const shouldShowToast = typeof showToast === 'boolean' ? showToast : true
    
    const planData = {
      total_sets: this.data.totalSets,
      days_per_set: this.data.daysPerSet,
      current_set: this.data.currentSet,
      target_hours: this.data.targetHours,
      night_start_time: this.data.nightStartTime,
      night_end_time: this.data.nightEndTime,
      start_date: this.data.startDate
    }
    
    try {
      await api.plan.update(planData)
      if (shouldShowToast) {
        wx.showToast({
          title: '已同步到云端',
          icon: 'success'
        })
      }
    } catch (err) {
      console.error('保存失败:', err)
      // 保存到本地
      wx.setStorageSync('user_plan', {
        totalSets: this.data.totalSets,
        daysPerSet: this.data.daysPerSet,
        currentSet: this.data.currentSet,
        targetHours: this.data.targetHours,
        nightStartTime: this.data.nightStartTime,
        nightEndTime: this.data.nightEndTime,
        startDate: this.data.startDate
      })
      if (shouldShowToast) {
        wx.showToast({
          title: '已保存到本地',
          icon: 'success'
        })
      }
    }
  },

  // 切换到下一副
  async onNextSet() {
    if (this.data.currentSet >= this.data.totalSets) {
      wx.showToast({
        title: '已经是最后一副',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '确认切换',
      content: `确定切换到第 ${this.data.currentSet + 1} 副牙套吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.plan.nextSet()
            this.setData({
              currentSet: this.data.currentSet + 1
            })
            this.updateCalculatedValues()
            wx.showToast({
              title: '切换成功',
              icon: 'success'
            })
          } catch (err) {
            console.error('切换失败:', err)
            this.setData({
              currentSet: this.data.currentSet + 1
            })
            this.updateCalculatedValues()
            this.savePlan()
          }
        }
      }
    })
  },

  // Picker变化事件（自动保存到云端）
  onTotalSetsChange(e) {
    this.setData({
      totalSets: this.data.totalSetsRange[e.detail.value]
    })
    this.updateCalculatedValues()
    this.savePlan(false)  // 静默保存
  },

  onDaysPerSetChange(e) {
    this.setData({
      daysPerSet: this.data.daysPerSetRange[e.detail.value]
    })
    this.calculateDaysWorn()
    this.updateCalculatedValues()
    this.savePlan(false)
  },

  onTargetHoursChange(e) {
    this.setData({
      targetHours: this.data.targetHoursRange[e.detail.value]
    })
    this.savePlan(false)
  },

  onNightStartChange(e) {
    this.setData({
      nightStartTime: e.detail.value
    })
    this.savePlan(false)
  },

  onNightEndChange(e) {
    this.setData({
      nightEndTime: e.detail.value
    })
    this.savePlan(false)
  },

  onStartDateChange(e) {
    this.setData({
      startDate: e.detail.value
    })
    this.calculateDaysWorn()
    this.savePlan(false)
  },

  onCurrentSetChange(e) {
    const newSet = parseInt(e.detail.value) || 1
    if (newSet >= 1 && newSet <= this.data.totalSets) {
      this.setData({
        currentSet: newSet
      })
      this.updateCalculatedValues()
      this.savePlan(false)
    }
  }
})
