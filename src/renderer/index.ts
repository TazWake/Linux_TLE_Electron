import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { App } from './app'

ModuleRegistry.registerModules([AllCommunityModule])

new App()
