import { registerRootComponent } from 'expo';

// Registers the background location TaskManager task. Must happen here, at
// the top of the entry module, unconditionally — iOS can relaunch the app
// fully in the background just to deliver a location update, and the task
// has to already be defined by the time that cold-start code runs (it won't
// be if this only happened inside a component that hasn't mounted yet).
import './src/lib/locationLog/backgroundTask';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
