import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { App } from './app'
import { installRendererDebugHandlers } from './rendererDebug'

ModuleRegistry.registerModules([AllCommunityModule])
installRendererDebugHandlers()

new App()
