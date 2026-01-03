import { useState } from 'react'

export default function LoginScreen({ onLogin, showToast }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast?.('Please enter your name', 'danger')
      return
    }
    onLogin(name.trim())
  }

  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center z-50">
      <div className="bg-surface p-10 rounded-xl text-center shadow-2xl w-[90%] max-w-[400px]">
        <h1 className="text-2xl font-semibold mb-2">Welcome to Peers</h1>
        <p className="text-gray-400 mb-6">Enter your name to join</p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full p-3 mb-4 bg-surface-light border border-transparent rounded-lg text-white text-base outline-none focus:border-primary transition-colors"
          />
          
          <button
            type="submit"
            className="w-full p-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}
