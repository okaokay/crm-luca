import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, LogIn, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useAuthStore } from '@/store/authStore'
import type { LoginForm } from '@/types'

// Schema di validazione
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email richiesta')
    .email('Email non valida'),
  password: z
    .string()
    .min(6, 'La password deve essere di almeno 6 caratteri'),
})

export function LoginPage() {
  const navigate = useNavigate()
  const { login, setLoading, isLoading } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      setLoading(true)
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
        credentials: 'include',
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(payload?.message || 'Credenziali non valide')
        return
      }

      const user = payload?.data?.user
      const token = payload?.data?.token
      const refreshToken = payload?.data?.refreshToken

      if (!user || !token) {
        toast.error('Risposta login non valida')
        return
      }

      login(user, token, refreshToken)
      toast.success('Login effettuato con successo!')
      navigate('/dashboard')
      
    } catch (error) {
      toast.error('Errore durante il login')
      console.error('Login error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-600 rounded-full flex items-center justify-center">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Accedi al tuo CRM
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Gestisci la tua agenzia immobiliare
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
              id="email"
                {...register('email')}
                type="email"
                autoComplete="email"
                className={`input w-full ${errors.email ? 'border-red-500' : ''}`}
                placeholder="mario.rossi@agenzia.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`input w-full pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          {/* Remember me & Forgot password */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Ricordami
              </label>
            </div>

            <div className="text-sm">
              <a
                href="#"
                className="font-medium text-primary-600 hover:text-primary-500"
              >
                Password dimenticata?
              </a>
            </div>
          </div>

          {/* Submit button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg w-full flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <div className="spinner h-5 w-5" />
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  <span>Accedi</span>
                </>
              )}
            </button>
          </div>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              Credenziali Demo
            </h3>
            <div className="text-xs text-blue-700 space-y-1">
              <p><strong>Email:</strong> demo@agenzia.com</p>
              <p><strong>Password:</strong> demo123</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
} 
