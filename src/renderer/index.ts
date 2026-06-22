import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import { App } from './app'
import { installRendererDebugHandlers } from './rendererDebug'

ModuleRegistry.registerModules([AllCommunityModule])
installRendererDebugHandlers()

new App()
