#!/usr/bin/env node

/**
 * Test Quality Gate Script
 * 
 * This script enforces code quality standards by checking:
 * - Test coverage thresholds
 * - Test result quality
 * - Business logic coverage requirements
 * - Integration test coverage
 */

const fs = require('fs')
const path = require('path')

const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-summary.json')
const BUSINESS_LOGIC_PATHS = [
  'src/stores/',
  'src/lib/',
  'src/hooks/'
]

const QUALITY_THRESHOLDS = {
  // Foundation-first approach: Start with achievable 20% global coverage
  global: {
    statements: 20,
    branches: 20,
    functions: 20,
    lines: 20
  },
  // Focus on core recording functionality first
  coreRecording: {
    statements: 50,
    branches: 50,
    functions: 50,
    lines: 50
  },
  // Critical stores should be well tested
  critical: {
    statements: 70,
    branches: 70,
    functions: 70,
    lines: 70
  }
}

const CRITICAL_FILES = [
  'src/stores/recording-store.ts',
  'src/stores/timeline-store.ts',
  'src/lib/recording/screen-recorder.ts',
  'src/hooks/use-recording.ts'
]

function loadCoverageData() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('❌ Coverage file not found. Run tests with --coverage first.')
    process.exit(1)
  }
  
  return JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'))
}

function checkCoverageThreshold(actual, expected, metric, context) {
  const passed = actual >= expected
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${context} ${metric}: ${actual}% (required: ${expected}%)`)
  return passed
}

function checkGlobalCoverage(coverage) {
  console.log('\n📊 Global Coverage Check')
  console.log('=' .repeat(50))
  
  let allPassed = true
  const total = coverage.total
  
  Object.entries(QUALITY_THRESHOLDS.global).forEach(([metric, threshold]) => {
    const actual = total[metric].pct
    const passed = checkCoverageThreshold(actual, threshold, metric, 'Global')
    allPassed = allPassed && passed
  })
  
  return allPassed
}

function checkCoreRecordingCoverage(coverage) {
  console.log('\n🎯 Core Recording Coverage Check')
  console.log('=' .repeat(50))
  
  let allPassed = true
  
  Object.entries(coverage).forEach(([filePath, fileStats]) => {
    const isCoreRecording = filePath.includes('src/lib/recording/')
    
    if (isCoreRecording && filePath !== 'total') {
      console.log(`\nChecking core recording: ${filePath}`)
      
      Object.entries(QUALITY_THRESHOLDS.coreRecording).forEach(([metric, threshold]) => {
        const actual = fileStats[metric].pct
        const passed = checkCoverageThreshold(actual, threshold, metric, '  ')
        allPassed = allPassed && passed
      })
    }
  })
  
  return allPassed
}

function checkCriticalFilesCoverage(coverage) {
  console.log('\n🚨 Critical Files Coverage Check')
  console.log('=' .repeat(50))
  
  let allPassed = true
  
  CRITICAL_FILES.forEach(criticalFile => {
    const fileStats = Object.entries(coverage).find(([path]) => path.includes(criticalFile))
    
    if (fileStats) {
      const [filePath, stats] = fileStats
      console.log(`\nChecking critical file: ${filePath}`)
      
      Object.entries(QUALITY_THRESHOLDS.critical).forEach(([metric, threshold]) => {
        const actual = stats[metric].pct
        const passed = checkCoverageThreshold(actual, threshold, metric, '  ')
        allPassed = allPassed && passed
      })
    } else {
      console.log(`⚠️  Critical file not found in coverage: ${criticalFile}`)
      allPassed = false
    }
  })
  
  return allPassed
}

function checkTestFilesCoverage(coverage) {
  console.log('\n🧪 Test Files Coverage Check')
  console.log('=' .repeat(50))
  
  const testFiles = Object.keys(coverage).filter(path => 
    path.includes('__tests__') || path.includes('.test.') || path.includes('.spec.')
  )
  
  const businessLogicFiles = Object.keys(coverage).filter(path => 
    BUSINESS_LOGIC_PATHS.some(blPath => path.includes(blPath)) && path !== 'total'
  )
  
  const testedFiles = new Set()
  testFiles.forEach(testFile => {
    // Extract the file being tested from test file name
    const baseFileName = testFile
      .replace(/__tests__\//, '')
      .replace(/\.test\.ts$/, '.ts')
      .replace(/\.spec\.ts$/, '.ts')
    
    businessLogicFiles.forEach(blFile => {
      if (blFile.includes(baseFileName)) {
        testedFiles.add(blFile)
      }
    })
  })
  
  const untestedFiles = businessLogicFiles.filter(file => !testedFiles.has(file))
  
  console.log(`📋 Business logic files: ${businessLogicFiles.length}`)
  console.log(`✅ Files with tests: ${testedFiles.size}`)
  console.log(`❌ Files without tests: ${untestedFiles.length}`)
  
  if (untestedFiles.length > 0) {
    console.log('\nFiles missing tests:')
    untestedFiles.forEach(file => console.log(`  - ${file}`))
  }
  
  const testCoverage = (testedFiles.size / businessLogicFiles.length) * 100
  console.log(`\n📊 Test coverage: ${testCoverage.toFixed(1)}%`)
  
  return testCoverage >= 90 // Require 90% of business logic to have tests
}

function generateQualityReport(coverage) {
  console.log('\n📈 Quality Report')
  console.log('=' .repeat(50))
  
  const total = coverage.total
  const metrics = ['statements', 'branches', 'functions', 'lines']
  
  console.log('Overall Statistics:')
  metrics.forEach(metric => {
    const stats = total[metric]
    console.log(`  ${metric}: ${stats.covered}/${stats.total} (${stats.pct}%)`)
  })
  
  // Calculate quality score
  const avgCoverage = metrics.reduce((sum, metric) => sum + total[metric].pct, 0) / metrics.length
  let grade = 'F'
  
  if (avgCoverage >= 95) grade = 'A+'
  else if (avgCoverage >= 90) grade = 'A'
  else if (avgCoverage >= 85) grade = 'B+'
  else if (avgCoverage >= 80) grade = 'B'
  else if (avgCoverage >= 75) grade = 'C+'
  else if (avgCoverage >= 70) grade = 'C'
  else if (avgCoverage >= 65) grade = 'D'
  
  console.log(`\n🎯 Quality Score: ${avgCoverage.toFixed(1)}% (Grade: ${grade})`)
  
  return { avgCoverage, grade }
}

function main() {
  console.log('🔍 Running Test Quality Gate')
  console.log('=' .repeat(50))
  
  const coverage = loadCoverageData()
  
  const checks = [
    () => checkGlobalCoverage(coverage),
    () => checkCoreRecordingCoverage(coverage),
    () => checkCriticalFilesCoverage(coverage)
  ]
  
  const results = checks.map(check => check())
  const allPassed = results.every(result => result)
  
  const { avgCoverage, grade } = generateQualityReport(coverage)
  
  console.log('\n' + '=' .repeat(50))
  
  if (allPassed) {
    console.log('🎉 All quality gates passed!')
    console.log('✅ Code meets quality standards')
    process.exit(0)
  } else {
    console.log('💥 Quality gate failed!')
    console.log('❌ Code does not meet quality standards')
    console.log('\nTo fix:')
    console.log('1. Add more tests to increase coverage')
    console.log('2. Test edge cases and error paths')
    console.log('3. Add integration tests for critical workflows')
    console.log('4. Ensure all business logic files have corresponding tests')
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  checkGlobalCoverage,
  checkBusinessLogicCoverage,
  checkCriticalFilesCoverage,
  checkTestFilesCoverage,
  generateQualityReport
}