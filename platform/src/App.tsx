import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MobileLanding from './pages/MobileLanding'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<MobileLanding />} />
      </Routes>
    </BrowserRouter>
  )
}
