# Bokeh Test Suite

## Structure
```
tests/
├── unit/           # Fast, isolated unit tests
├── integration/    # Integration tests (components working together)
├── e2e/           # End-to-end tests (full app flow)
└── run-all.js     # Master test runner
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific category
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Run individual test
```bash
node tests/unit/test-constraints.js
node tests/integration/test-recording.js
node tests/e2e/test-recording-real.js
```

## Test Categories

### Unit Tests
- Fast, isolated tests
- No external dependencies
- Test individual functions/modules
- Example: `test-constraints.js` - validates recording constraints

### Integration Tests
- Test components working together
- May use mocks/stubs
- Example: `test-recording.js` - tests recording flow with mocks

### E2E Tests
- Full end-to-end testing
- Launches real app
- Tests actual user flows
- Example: `test-recording-real.js` - tests real recording with UI

## Adding New Tests

1. Create test file in appropriate folder
2. Follow naming convention: `test-{feature}.js`
3. Export test results with exit codes:
   - 0 = success
   - 1 = failure
4. Use consistent logging format

## CI/CD Integration

Tests can be run in CI with:
```yaml
- name: Run tests
  run: npm test
```