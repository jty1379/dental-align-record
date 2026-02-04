// API配置
const BASE_URL = 'http://localhost:8001/api'  // 开发环境
// const BASE_URL = 'https://你的域名/api'  // 生产环境

// 获取存储的token
function getToken() {
  return wx.getStorageSync('token') || ''
}

// 设置token
function setToken(token) {
  wx.setStorageSync('token', token)
}

// 清除token
function clearToken() {
  wx.removeStorageSync('token')
}

// 封装请求
function request(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const token = getToken()
    
    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token过期，清除并提示重新登录
          clearToken()
          wx.showToast({
            title: '登录已过期',
            icon: 'none'
          })
          reject(new Error('Token过期'))
        } else {
          reject(new Error(res.data.detail || '请求失败'))
        }
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

// 登录
function login(code) {
  return request('/auth/login', 'POST', { code })
}

// 计时相关API（时间由服务器决定）
const timer = {
  getStatus: () => request('/timer/status'),
  start: () => request('/timer/start', 'POST', {}),  // 不传时间，由服务器生成
  stop: (sessionId) => request('/timer/stop', 'POST', { session_id: sessionId })  // 不传时间
}

// 计划相关API
const plan = {
  get: () => request('/plan'),
  update: (data) => request('/plan', 'PUT', data),
  nextSet: () => request('/plan/next-set', 'POST')
}

// 统计相关API
const stats = {
  weekly: (weekOffset = 0) => request(`/stats/weekly?week_offset=${weekOffset}`),
  records: (startDate, endDate) => {
    let url = '/stats/records'
    const params = []
    if (startDate) params.push(`start_date=${startDate}`)
    if (endDate) params.push(`end_date=${endDate}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  },
  achievements: () => request('/stats/achievements')
}

module.exports = {
  BASE_URL,
  getToken,
  setToken,
  clearToken,
  request,
  login,
  timer,
  plan,
  stats
}
