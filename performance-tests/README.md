# 🚀 Flying Squid Performance Testing Framework

A modern, TypeScript-based performance testing framework for the Flying Squid Minecraft server. Built with best practices and designed to provide comprehensive performance analysis and benchmarking.

## ✨ Features

- **Modern Architecture**: Built with TypeScript, ES modules, and modern Node.js features
- **Comprehensive Testing**: Movement, building, load testing, and more
- **Real-time Metrics**: TPS, memory usage, CPU usage, latency, and network statistics
- **Flexible Scenarios**: Easy to create custom test scenarios
- **Beautiful CLI**: Rich terminal interface with progress indicators and results display
- **Extensible**: Plugin-based architecture for custom behaviors and patterns
- **Production Ready**: Robust error handling, logging, and cleanup

## 🏗️ Architecture

```
performance-tests/
├── src/
│   ├── types/           # TypeScript interfaces and types
│   ├── utils/           # Core utilities (logger, metrics, server manager)
│   ├── scenarios/       # Test scenario implementations
│   ├── runner.ts        # Main test execution engine
│   └── index.ts         # Public API exports
├── examples/            # Usage examples
├── configs/             # Test configurations
└── logs/                # Generated log files
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd performance-tests
pnpm install
```

### 2. Run a Simple Movement Test

```bash
# Run with 25 players for 2 minutes on flat world
pnpm run perf:movement -- --players 25 --duration 120 --world flat

# Or use the CLI directly
pnpm tsx src/runner.ts movement --players 25 --duration 120
```

### 3. Run All Tests

```bash
pnpm run perf:all
```

### 4. List Available Scenarios

```bash
pnpm tsx src/runner.ts list
```

## 📊 Test Scenarios

### Movement Tests
- **Random Movement**: Bots move randomly within a radius
- **Circular Movement**: Bots move in circular patterns
- **Linear Movement**: Bots move in straight lines
- **Custom Patterns**: Extensible movement pattern system

### Configuration Options
- Player count: 1-100 players
- Test duration: 10 seconds to 1 hour
- World types: flat, default, superflat
- Server settings: port, version, modules

## 🛠️ Programmatic Usage

### Basic Movement Test

```typescript
import { runMovementTest } from '@flying-squid/performance-tests'

async function testPerformance() {
  const result = await runMovementTest(50, 300, 'flat')
  
  console.log(`Performance Score: ${result.summary.performanceScore}/100`)
  console.log(`Average TPS: ${result.summary.averageTPS}`)
  console.log(`Memory Usage: ${result.summary.averageMemory} bytes`)
}
```

### Custom Test Scenario

```typescript
import { TestScenario, TestConfig } from '@flying-squid/performance-tests'

class CustomTestScenario implements TestScenario {
  readonly name = 'Custom Test'
  readonly description = 'My custom performance test'
  readonly config: TestConfig = {
    name: 'Custom Test',
    description: 'My custom performance test',
    playerCount: 25,
    duration: 120,
    worldType: 'flat',
    serverPort: 25566,
    serverHost: 'localhost',
    version: '1.20.1'
  }

  async run(): Promise<TestResult> {
    // Implement your test logic
  }

  validate(): boolean {
    return true
  }

  async cleanup(): Promise<void> {
    // Cleanup logic
  }
}
```

### Using the Test Runner

```typescript
import { PerformanceTestRunner } from '@flying-squid/performance-tests'

const runner = new PerformanceTestRunner()

// Run a single scenario
const result = await runner.run(scenario)

// Run all scenarios
const results = await runner.runAll()

// Run as a suite
const suiteResult = await runner.runSuite({
  name: 'My Test Suite',
  description: 'Custom test suite',
  scenarios: [scenario1, scenario2],
  config: {
    parallel: false,
    maxConcurrent: 1,
    stopOnFailure: false,
    retryFailed: false,
    maxRetries: 0
  }
})
```

## 📈 Metrics Collected

### Server Metrics
- **TPS (Ticks Per Second)**: Server performance indicator
- **Memory Usage**: RSS, heap, external memory
- **CPU Usage**: User and system CPU time
- **Network Statistics**: Bytes in/out, packets in/out

### Client Metrics
- **Latency**: Connection response times
- **Movement**: Position updates and pathfinding
- **Connection Status**: Spawn, disconnect events

### Performance Scores
- **Overall Score**: 0-100 based on TPS, memory, and latency
- **Stability Metrics**: Standard deviations and consistency
- **Resource Usage**: Memory growth and CPU efficiency

## 🔧 Configuration

### Environment Variables
```bash
NODE_ENV=production          # Production mode
LOG_LEVEL=debug             # Logging level
SERVER_PATH=/path/to/server # Custom server path
```

### Test Configuration
```typescript
const config: TestConfig = {
  name: 'High Load Test',
  description: 'Test with 100 players',
  playerCount: 100,
  duration: 300, // 5 minutes
  worldType: 'flat',
  serverPort: 25566,
  serverHost: 'localhost',
  version: '1.20.1',
  modules: {
    'safeZones': false,
    'antiCheat': true
  }
}
```

## 📝 Logging

The framework uses Winston for structured logging with:
- **Console Output**: Colored, formatted logs
- **File Rotation**: Daily log files with size limits
- **Structured Data**: JSON format for machine processing
- **Performance Events**: Specialized logging for test events

## 🧪 Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm run test:coverage

# Watch mode
pnpm run test:watch
```

## 📦 Building

```bash
# Build TypeScript
pnpm run build

# Development mode
pnpm run dev

# Clean build
pnpm run clean && pnpm run build
```

## 🚀 Advanced Usage

### Custom Movement Patterns

```typescript
class SpiralMovementPattern implements MovementPattern {
  type = 'spiral' as const
  params = { radius: 50, speed: 0.1 }

  generatePosition(bot: Bot, tick: number): Vec3 {
    const basePos = bot.entity.position
    const radius = this.params.radius
    const speed = this.params.speed
    
    const angle = (tick * speed) % (2 * Math.PI)
    const distance = (tick * speed * 0.1) % radius
    
    return new Vec3(
      basePos.x + Math.cos(angle) * distance,
      basePos.y,
      basePos.z + Math.sin(angle) * distance
    )
  }
}
```

### Custom Client Behaviors

```typescript
class BuildingClientBehavior implements ClientBehavior {
  async onSpawn(bot: Bot): Promise<void> {
    // Initialize building materials
  }

  async onTick(bot: Bot): Promise<void> {
    // Execute building actions
  }

  async onDisconnect(bot: Bot): Promise<void> {
    // Cleanup
  }

  getMetrics(bot: Bot): Partial<PerformanceMetrics> {
    // Return custom metrics
  }
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**: Change server port in test config
2. **Memory Issues**: Reduce player count or test duration
3. **Build Failures**: Ensure server dependencies are installed
4. **Bot Spawn Failures**: Check server status and version compatibility

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm run perf:movement

# Verbose server output
DEBUG=* pnpm run perf:movement
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests and documentation
5. Submit a pull request

### Adding New Scenarios

1. Create scenario class in `src/scenarios/`
2. Implement `TestScenario` interface
3. Add to runner's default scenarios
4. Update CLI commands
5. Add tests and examples

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built for the Flying Squid Minecraft server project
- Uses Mineflayer for Minecraft client simulation
- Inspired by modern testing frameworks and best practices