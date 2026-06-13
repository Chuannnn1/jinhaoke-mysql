// ============================================================
// 教學：React 底層 — JSX 其實是函式呼叫
// 位置：app/demo/how-react-works/page.jsx
// ============================================================
// 目的：搞清楚瀏覽器實際看到什麼
// 先看 JSX，再看純 JS 版本對照
// ============================================================

'use client'
import React, { useState } from 'react'

// ---- 實驗 A：看見 React.createElement 的真面目 ----
// 我們故意寫一個「不用 JSX」的 Counter

function CounterPureJS() {
  const [count, setCount] = useState(0)

  // 下面兩種寫法完全等價
  // 左邊：JSX（你寫的）
  // 右邊：React.createElement（瀏覽器實際執行的）
  const jsxVersion = (
    <div className="p-4 bg-blue-50 rounded">
      <p>計數：{count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  )
  const pureJSVersion = React.createElement('div',
    { className: 'p-4 bg-green-50 rounded' },
    React.createElement('p', null, `計數：${count}`),
    React.createElement('button',
      { onClick: () => setCount(count + 1) },
      '+'
    )
  )

  // 切換看哪個版本
  const [showJS, setShowJS] = useState(false)

  return (
    <div className="bg-gray-100 p-4 rounded mb-4">
      <h3 className="font-bold mb-2">實驗 A：JSX ↔ 純 JavaScript 對照</h3>
      <button
        onClick={() => setShowJS(!showJS)}
        className="text-xs bg-gray-200 px-2 py-1 rounded mb-2"
      >
        切換看 {showJS ? 'JSX 版本' : '純 JS 版本'}
      </button>

      {/* 👇 完全等價，只是 display 不同 */}
      <div className="mt-2">{showJS ? pureJSVersion : jsxVersion}</div>

      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer">
          📄 點我看純 JS 原始碼（瀏覽器實際執行的）
        </summary>
        <pre className="bg-gray-800 text-green-400 p-3 rounded text-xs mt-1 overflow-x-auto">
{`// 等價的純 JS 寫法（無 JSX 語法）：
const pureJSVersion = React.createElement('div',
  { className: 'p-4 bg-green-50 rounded' },
  React.createElement('p', null, '計數：' + count),
  React.createElement('button',
    { onClick: () => setCount(count + 1) },
    '+'
  )
)

// JSX 只是語法糖：
// <div className="...">...</div>
//      ↓ Babel 編譯
// React.createElement('div', {...}, ...) `}
        </pre>
      </details>
    </div>
  )
}

// ---- 實驗 B：元件就是函式 ----

// 子元件：AlertBox
// 它是一個普通的 function，只是 return JSX
function AlertBox({ title, children, color = 'yellow' }) {
  // props = 從父層傳下來的參數（像函式的 arguments）
  const bgMap = {
    yellow: 'bg-yellow-100 border-yellow-300',
    red: 'bg-red-100 border-red-300',
    green: 'bg-green-100 border-green-300',
  }
  return (
    <div className={`p-3 border rounded ${bgMap[color]}`}>
      <p className="font-bold text-sm">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  )
}

// 父元件：使用 AlertBox
function ComponentDemo() {
  return (
    <div className="bg-gray-100 p-4 rounded mb-4">
      <h3 className="font-bold mb-2">實驗 B：元件就是函式（父→子傳遞資料）</h3>
      <p className="text-xs text-gray-500 mb-2">
        💡 AlertBox 是函式，傳入 props（title、children、color），回傳 JSX。
        <br/>然後在 ParentComponent 裡像 HTML 標籤一樣呼叫它。
      </p>

      {/* 👇 使用自訂元件，props = 參數 */}
      <AlertBox title="✅ 原理說明" color="green">
        父層想傳資料給子層 → 用 props
      </AlertBox>

      <AlertBox title="⚠️ 注意" color="yellow">
        父子元件的 useState 各自獨立，不會互相影響
      </AlertBox>

      <AlertBox title="❌ 錯誤" color="red">
        不要在迴圈裡使用沒有 key 的元件
      </AlertBox>

      {/* 實驗：在 map 裡用 AlertBox（必須給 key） */}
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-1">在 map 裡面用（需加 key）：</p>
        {['第一項', '第二項', '第三項'].map((item, index) => (
          <AlertBox key={index} title={item} color="yellow">
            這是第 {index + 1} 項
          </AlertBox>
        ))}
      </div>
    </div>
  )
}

// ---- 實驗 C：import / export 如何運作 ----

// 另一個檔案 components/Greeting.jsx 會 export 這個元件
// 這裡我們在同檔案示範 import 的概念
function Greeting({ name }) {
  return <span className="text-blue-600">Hello, {name}！</span>
}

// 用另一個元件包裝它，示範「輸出」的概念
function ImportExportDemo() {
  // 假裝我們 import 了 Greeting：import Greeting from './Greeting'
  // 這裡直接定義同個檔案來類比
  return (
    <div className="bg-gray-100 p-4 rounded mb-4">
      <h3 className="font-bold mb-2">實驗 C：import / export 是怎麼回事</h3>

      <div className="bg-white p-3 rounded mb-2">
        <p className="text-sm mb-2">流程說明：</p>
        <div className="space-y-1 text-xs">
          <p>{'1. 子元件用 export default function Xxx() 輸出'}</p>
          <p>{'2. 父元件用 import Xxx from \'./Xxx\' 引入'}</p>
          <p>{'3. 父元件在 JSX 裡寫 <Xxx /> 來使用'}</p>
        </div>
      </div>

      {/* 👇 實際使用（想像 Greeting 是從別的檔案 import 來的） */}
      <div className="bg-white p-3 rounded">
        <p className="text-sm mb-1">實際渲染結果：</p>
        <p className="text-lg"><Greeting name="金濠客" /></p>
        <p className="text-xs text-gray-400 mt-1">
          Greeting 元件是函式，傳 name 當參數，回傳 JSX
        </p>
      </div>

      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer">
          📄 看 Greeting 元件的原始程式碼
        </summary>
        <pre className="bg-gray-800 text-green-400 p-3 rounded text-xs mt-1">
{`// === 子元件：components/Greeting.jsx ===
export default function Greeting({ name }) {
  return <span className="text-blue-600">Hello, {name}！</span>
}

// === 父元件：使用它 ===
import Greeting from './Greeting'

export default function Page() {
  return <Greeting name="金濠客" />
}
// 輸出結果：<span class="text-blue-600">Hello, 金濠客！</span>`}
        </pre>
      </details>
    </div>
  )
}

// ---- 實驗 D：為什麼要用元件？ ----

// 三個不同的卡片，每個都是同一個元件，不同的 props
function FoodCard({ name, price, emoji }) {
  return (
    <div className="bg-white p-3 rounded border hover:shadow-md transition-shadow cursor-pointer">
      <div className="text-3xl mb-1">{emoji}</div>
      <p className="font-medium text-sm">{name}</p>
      <p className="text-yellow-600 font-mono">NT$ {price}</p>
    </div>
  )
}

function WhyComponent() {
  return (
    <div className="bg-gray-100 p-4 rounded mb-4">
      <h3 className="font-bold mb-2">實驗 D：為什麼要用元件？</h3>
      <p className="text-xs text-gray-500 mb-3">
        💡 不需要重複寫同樣的 HTML。定義一次 FoodCard，用不同 props 就能生出不同內容。
      </p>

      {/* 用同一個元件，產生三張卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <FoodCard name="大比目魚排便當" price={130} emoji="🐟" />
        <FoodCard name="酥炸豬排便當"   price={130} emoji="🐷" />
        <FoodCard name="酥嫩雞腿便當"   price={130} emoji="🍗" />
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        三張卡片的 HTML 結構完全相同，只是 name/price/emoji 不同
      </p>

      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer">
          📄 如果不用元件，要怎麼寫？
        </summary>
        <pre className="bg-gray-800 text-red-300 p-3 rounded text-xs mt-1">
{`// ❌ 不用元件的寫法：重複又難維護
<div className="bg-white p-3 rounded border">
  <div className="text-3xl mb-1">🐟</div>
  <p className="font-medium text-sm">大比目魚排便當</p>
  <p className="text-yellow-600 font-mono">NT$ 130</p>
</div>
<div className="bg-white p-3 rounded border">
  <div className="text-3xl mb-1">🐷</div>
  <p className="font-medium text-sm">酥炸豬排便當</p>
  <p className="text-yellow-600 font-mono">NT$ 130</p>
</div>
<div className="bg-white p-3 rounded border">
  <div className="text-3xl mb-1">🍗</div>
  <p className="font-medium text-sm">酥嫩雞腿便當</p>
  <p className="text-yellow-600 font-mono">NT$ 130</p>
</div>

// ✅ 用元件：定義一次，替換 props 即可
<FoodCard name="大比目魚排便當" price={130} emoji="🐟" />
<FoodCard name="酥炸豬排便當"   price={130} emoji="🐷" />
<FoodCard name="酥嫩雞腿便當"   price={130} emoji="🍗" />`}
        </pre>
      </details>
    </div>
  )
}

// ---- 主頁面 ----
export default function HowReactWorks() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">React 底層運作</h1>
        <p className="text-gray-500 text-sm mb-6">
          JSX 其實是函式呼叫，元件其實是函式，import/export 其實是模組引用
        </p>

        <CounterPureJS />
        <ComponentDemo />
        <ImportExportDemo />
        <WhyComponent />
      </div>
    </div>
  )
}