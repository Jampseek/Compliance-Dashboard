import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ScreeningMonitor from './pages/ScreeningMonitor'
import AlertQueue from './pages/AlertQueue'
import AnalystDashboard from './pages/AnalystDashboard'
import CaseInvestigation from './pages/CaseInvestigation'
import ExecutiveDashboard from './pages/ExecutiveDashboard'
import AuditStore from './pages/AuditStore'
import AdverseMediaMonitor from './pages/AdverseMediaMonitor'
import KYCReporting from './pages/KYCReporting'
import EddReports from './pages/EddReports'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/screening" replace />} />
          <Route path="/screening" element={<ScreeningMonitor />} />
          <Route path="/alerts" element={<AlertQueue />} />
          <Route path="/analyst" element={<AnalystDashboard />} />
          <Route path="/cases" element={<CaseInvestigation />} />
          <Route path="/executive" element={<ExecutiveDashboard />} />
          <Route path="/media" element={<AdverseMediaMonitor />} />
          <Route path="/edd" element={<EddReports />} />
          <Route path="/kyc" element={<KYCReporting />} />
          <Route path="/audit" element={<AuditStore />} />
          <Route path="*" element={<Navigate to="/screening" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
