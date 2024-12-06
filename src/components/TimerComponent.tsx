'use client'

import { Timer } from 'lucide-react'
import { useEffect, useState } from 'react'

const TimerComponent = ({ startTime }: { startTime: string }) => {
  const [elapsedTime, setElapsedTime] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('#80a76ebe')

  useEffect(() => {
    const start = new Date(startTime).getTime()

    const interval = setInterval(() => {
      const now = new Date().getTime()
      const diff = now - start

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        .toString()
        .padStart(2, '0')

      const textToDisplay =
        hours > 0
          ? `${hours.toString().padStart(2, '0')}:${minutes
              .toString()
              .padStart(2, '0')}:${seconds}`
          : `${minutes.toString().padStart(2, '0')}:${seconds}`

      setElapsedTime(textToDisplay)

      if (minutes >= 30 || hours > 0) {
        setBackgroundColor('#d17f7f')
      } else if (minutes >= 15) {
        setBackgroundColor('#eac568')
      } else {
        setBackgroundColor('#80a76ebe')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div
      className='px-2 py-1 rounded-full flex items-center gap-1 font-bold text-xl text-black'
      style={{ backgroundColor }}
    >
      <Timer width={20} height={20} />
      <span>{elapsedTime}</span>
    </div>
  )
}

export default TimerComponent
