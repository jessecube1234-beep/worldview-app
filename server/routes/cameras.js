import { createCameraControllers } from '../controllers/cameraController.js';

function registerCameraRoutes(app, deps) {
  const controllers = createCameraControllers(deps);
  app.get('/api/cameras/singapore', controllers.singapore);
  app.get('/api/cameras/static/:city', controllers.staticCity);
  app.get('/api/cameras/windy', controllers.windy);
  app.get('/api/cameras/london', controllers.london);
  app.get('/api/cam-proxy', controllers.proxy);
}

export { registerCameraRoutes };
