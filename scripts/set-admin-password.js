// scripts/set-admin-password.js
// 互動產生 ADMIN_PASSWORD_HASH，寫進 .env.local
//
// 用法：
//   node scripts/set-admin-password.js
//   （會提示輸入密碼兩次）
//
// 或非互動：
//   node scripts/set-admin-password.js <密碼>
//
// 都會印出 hash 到 stdout，並安全寫入 .env.local（保留其它變數）
const path = require('path')
const fs = require('fs')
const readline = require('readline')
const { randomBytes, scryptSync } = require('crypto')

const ENV_PATH = path.join(__dirname, '..', '.env.local')

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function readEnvFile(p) {
  if (!fs.existsSync(p)) return {}
  const content = fs.readFileSync(p, 'utf8')
  const map = {}
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) map[m[1]] = m[2]
  }
  return map
}

function writeEnvFile(p, map) {
  const lines = Object.entries(map).map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(p, lines.join('\n') + '\n', { mode: 0o600 })
}

function prompt(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      // 簡單隱藏輸入：把 stdout 的 _write hook 起來，不顯示輸入字元
      const onData = () => process.stdout.write('')
      process.stdin.on('data', onData)
      rl.question(question, (ans) => {
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        rl.close()
        resolve(ans)
      })
    } else {
      rl.question(question, (ans) => { rl.close(); resolve(ans) })
    }
  })
}

;(async () => {
  let pw
  if (process.argv[2]) {
    pw = process.argv[2]
  } else {
    pw = await prompt('輸入新密碼: ', true)
    const confirm = await prompt('再輸入一次: ', true)
    if (pw !== confirm) {
      console.error('兩次輸入不一致')
      process.exit(1)
    }
  }
  if (!pw || pw.length < 6) {
    console.error('密碼至少 6 字')
    process.exit(1)
  }

  const hash = hashPassword(pw)
  const env = readEnvFile(ENV_PATH)
  env.ADMIN_PASSWORD_HASH = hash
  writeEnvFile(ENV_PATH, env)

  console.log('\n✓ 已寫入', ENV_PATH)
  console.log('  ADMIN_PASSWORD_HASH=<hash 不顯示>')
  console.log('\n重啟 dev server 後生效（next 會自動讀 .env.local）')
})()
