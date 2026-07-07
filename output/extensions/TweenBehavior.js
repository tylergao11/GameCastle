// TweenBehavior/JsExtension.js
//@ts-check
/// <reference path="../JsExtensionTypes.d.ts" />
/**
 * This is a declaration of an extension for GDevelop 5.
 *
 * ℹ️ Changes in this file are watched and automatically imported if the editor
 * is running. You can also manually run `node import-GDJS-Runtime.js` (in newIDE/app/scripts).
 *
 * The file must be named "JsExtension.js", otherwise GDevelop won't load it.
 * ⚠️ If you make a change and the extension is not loaded, open the developer console
 * and search for any errors.
 *
 * More information on https://github.com/4ian/GDevelop/blob/master/newIDE/README-extensions.md
 */

const easingChoices = JSON.stringify([
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInQuart',
  'easeOutQuart',
  'easeInOutQuart',
  'easeInQuint',
  'easeOutQuint',
  'easeInOutQuint',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInExpo',
  'easeOutExpo',
  'easeInOutExpo',
  'easeInCirc',
  'easeOutCirc',
  'easeInOutCirc',
  'easeOutBounce',
  'easeInBack',
  'easeOutBack',
  'easeInOutBack',
  'elastic',
  'swingFromTo',
  'swingFrom',
  'swingTo',
  'bounce',
  'bouncePast',
  'easeFromTo',
  'easeFrom',
  'easeTo',
]);

/** @type {ExtensionModule} */
module.exports = {
  createExtension: function (_, gd) {
    const extension = new gd.PlatformExtension();
    extension
      .setExtensionInformation(
        'Tween',
        _('Tweening'),
        _(
          'Smoothly animate object properties over time — such as position, rotation scale, opacity, and more — as well as variables. Ideal for creating fluid transitions and UI animations. While you can use tweens to move objects, other behaviors (like platform, physics, ellipse movement...) or forces are often better suited for dynamic movement. Tween is best used for animating UI elements, static objects that need to move from one point to another, or other values like variables.'
        ),
        'Matthias Meike, Florian Rival',
        'Open source (MIT License)'
      )
      .setShortDescription(
        'Smoothly animate position, scale, rotation, opacity, color, variables over time. Easing functions.'
      )
      .setCategory('Visual effect')
      .setTags('tween, interpolation, smooth')
      .setExtensionHelpPath('/behaviors/tween');
    extension
      .addInstructionOrExpressionGroupMetadata(_('Tweening'))
      .setIcon('JsPlatform/Extensions/tween_behavior32.png');

    extension
      .addExpression(
        'Ease',
        _('Ease'),
        _('Tween between 2 values according to an easing function.'),
        '',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('From value'))
      .addParameter('expression', _('To value'))
      .addParameter('expression', _('Weighting'))
      .setParameterLongDescription(_('From 0 to 1.'))
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .setFunctionName('gdjs.evtTools.tween.ease');

    // Deprecated
    extension
      .addAction(
        'TweenSceneVariableNumber',
        _('Tween a number in a scene variable'),
        _(
          "Tweens a scene variable's numeric value from one number to another."
        ),
        _(
          'Tween variable _PARAM2_ from _PARAM3_ to _PARAM4_ over _PARAM5_ms with easing _PARAM6_ as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('scenevar', _('The variable to tween'), '', false)
      .addParameter('expression', _('Initial value'), '', false)
      .addParameter('expression', _('Final value'), '', false)
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenVariableNumber');

    // Deprecated
    extension
      .addAction(
        'TweenSceneVariableNumber2',
        _('Tween a number in a scene variable'),
        _(
          "Tweens a scene variable's numeric value from its current value to a new one."
        ),
        _(
          'Tween variable _PARAM2_ to _PARAM3_ over _PARAM4_ms with easing _PARAM5_ as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('scenevar', _('The variable to tween'), '', false)
      .addParameter('expression', _('Final value'), '', false)
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenVariableNumber2');

    extension
      .addAction(
        'TweenSceneVariableNumber3',
        _('Tween a number in a scene variable'),
        _(
          "Tweens a scene variable's numeric value from its current value to a new one."
        ),
        _(
          'Tween variable _PARAM2_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('scenevar', _('The variable to tween'), '', false)
      .addParameter('expression', _('Final value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenVariableNumber3');

    extension
      .addAction(
        'AddLayoutValueTween',
        _('Tween a scene value'),
        _(
          'Tweens a scene value that can be use with the expression Tween::Value.'
        ),
        _(
          'Tween the value from _PARAM2_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('From value'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter('yesorno', _('Exponential interpolation'), '', false)
      .setDefaultValue('no')
      .markAsAdvanced()
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.addLayoutValueTween');

    extension
      .addAction(
        'AddLayerValueTween',
        _('Tween a layer value'),
        _(
          'Tweens a layer value that can be use with the expression Tween::Value.'
        ),
        _(
          'Tween the value of _PARAM7_ from _PARAM2_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('From value'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter('yesorno', _('Exponential interpolation'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .setDefaultValue('no')
      .markAsAdvanced()
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.addLayerValueTween');

    // deprecated
    extension
      .addAction(
        'TweenCameraPosition',
        _('Tween the camera position'),
        _('Tweens the camera position from the current one to a new one.'),
        _(
          'Tween camera on layer _PARAM4_ to _PARAM2_;_PARAM3_ over _PARAM5_ms with easing _PARAM6_ as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target X position'), '', false)
      .addParameter('expression', _('Target Y position'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCamera');

    extension
      .addAction(
        'TweenCameraPosition2',
        _('Tween the camera position'),
        _('Tweens the camera position from the current one to a new one.'),
        _(
          'Tween camera on layer _PARAM4_ to _PARAM2_;_PARAM3_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target X position'), '', false)
      .addParameter('expression', _('Target Y position'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCamera2');

    // deprecated
    extension
      .addAction(
        'TweenCameraZoom',
        _('Tween the camera zoom'),
        _('Tweens the camera zoom from the current zoom factor to a new one.'),
        _(
          'Tween the zoom of camera on layer _PARAM3_ to _PARAM2_ over _PARAM4_ms with easing _PARAM5_ as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target zoom'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCameraZoom');

    extension
      .addAction(
        'TweenCameraZoom2',
        _('Tween the camera zoom'),
        _('Tweens the camera zoom from the current zoom factor to a new one.'),
        _(
          'Tween the zoom of camera on layer _PARAM3_ to _PARAM2_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target zoom'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCameraZoom2');

    // deprecated
    extension
      .addAction(
        'TweenCameraRotation',
        _('Tween the camera rotation'),
        _('Tweens the camera rotation from the current angle to a new one.'),
        _(
          'Tween the rotation of camera on layer _PARAM3_ to _PARAM2_ over _PARAM4_ms with easing _PARAM5_ as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target rotation (in degrees)'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCameraRotation');

    extension
      .addAction(
        'TweenCameraRotation2',
        _('Tween the camera rotation'),
        _('Tweens the camera rotation from the current angle to a new one.'),
        _(
          'Tween the rotation of camera on layer _PARAM3_ to _PARAM2_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('Target rotation (in degrees)'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenCameraRotation2');

    extension
      .addAction(
        'TweenNumberEffectPropertyTween',
        _('Tween number effect property'),
        _(
          'Tweens a number effect property from its current value to a new one.'
        ),
        _(
          'Tween the property _PARAM5_ for effect _PARAM4_ of _PARAM3_ to _PARAM2_ with easing _PARAM6_ over _PARAM7_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('expression', _('To value'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('layerEffectName', _('Effect name'))
      .addParameter('layerEffectParameterName', _('Property name'))
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenNumberEffectPropertyTween');

    extension
      .addAction(
        'TweenColorEffectPropertyTween',
        _('Tween color effect property'),
        _(
          'Tweens a color effect property from its current value to a new one.'
        ),
        _(
          'Tween the color property _PARAM5_ for effect _PARAM4_ of _PARAM3_ to _PARAM2_ with easing _PARAM6_ over _PARAM7_ seconds as _PARAM1_'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('color', _('To color'), '', false)
      .addParameter('layer', _('Layer'), '', true)
      .addParameter('layerEffectName', _('Effect name'))
      .addParameter('layerEffectParameterName', _('Property name'))
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.tweenColorEffectPropertyTween');

    extension
      .addCondition(
        'SceneTweenExists',
        _('Scene tween exists'),
        _('Check if the scene tween exists.'),
        _('Scene tween _PARAM1_ exists'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.sceneTweenExists');

    extension
      .addCondition(
        'SceneTweenIsPlaying',
        _('Scene tween is playing'),
        _('Check if the scene tween is currently playing.'),
        _('Scene tween _PARAM1_ is playing'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.sceneTweenIsPlaying');

    extension
      .addCondition(
        'SceneTweenHasFinished',
        _('Scene tween finished playing'),
        _('Check if the scene tween has finished playing.'),
        _('Scene tween _PARAM1_ has finished playing'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.sceneTweenHasFinished');

    extension
      .addAction(
        'PauseSceneTween',
        _('Pause a scene tween'),
        _('Pause the running scene tween.'),
        _('Pause the scene tween _PARAM1_'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.pauseSceneTween');

    extension
      .addAction(
        'StopSceneTween',
        _('Stop a scene tween'),
        _('Stop the running scene tween.'),
        _('Stop the scene tween _PARAM1_ (jump to the end: _PARAM2_)'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .addParameter('yesorno', _('Jump to the end'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.stopSceneTween');

    extension
      .addAction(
        'ResumeSceneTween',
        _('Resume a scene tween'),
        _('Resume the scene tween.'),
        _('Resume the scene tween _PARAM1_'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.resumeSceneTween');

    extension
      .addAction(
        'RemoveSceneTween',
        _('Remove a scene tween'),
        _(
          'Remove the scene tween. Call this when the tween is no longer needed to free memory.'
        ),
        _('Remove the scene tween _PARAM1_'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.removeSceneTween');

    extension
      .addExpressionAndCondition(
        'number',
        'Progress',
        _('Tween progress'),
        _('the progress of a tween (between 0.0 and 1.0)'),
        _('the progress of the scene tween _PARAM1_'),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .useStandardParameters('number', gd.ParameterOptions.makeNewOptions())
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.getProgress');

    extension
      .addExpression(
        'Value',
        _('Tween value'),
        _(
          'Return the value of a tween. It is always 0 for tweens with several values.'
        ),
        _('Scene Tweens'),
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addCodeOnlyParameter('currentScene', '')
      .addParameter('identifier', _('Tween Identifier'), 'sceneTween')
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweentools.js')
      .setFunctionName('gdjs.evtTools.tween.getValue');

    const tweenBehavior = new gd.BehaviorJsImplementation();

    tweenBehavior.updateProperty = function (
      behaviorContent,
      propertyName,
      newValue
    ) {
      return false;
    };

    tweenBehavior.getProperties = function (behaviorContent) {
      var behaviorProperties = new gd.MapStringPropertyDescriptor();
      return behaviorProperties;
    };

    tweenBehavior.initializeContent = function (behaviorContent) {};

    const behavior = extension
      .addBehavior(
        'TweenBehavior',
        _('Tween'),
        'Tween',
        _(
          'Smoothly animate position, angle, scale and other properties of objects.'
        ),
        '',
        'JsPlatform/Extensions/tween_behavior32.png',
        'TweenBehavior',
        // @ts-ignore - TODO: Fix tweenBehavior being an BehaviorJsImplementation instead of an Behavior
        tweenBehavior,
        new gd.BehaviorsSharedData()
      )
      .setQuickCustomizationVisibility(gd.QuickCustomization.Hidden)
      .setIncludeFile('Extensions/TweenBehavior/TweenManager.js')
      .addIncludeFile('Extensions/TweenBehavior/tweenruntimebehavior.js');

    // Behavior related

    // Deprecated
    behavior
      .addAction(
        'AddObjectVariableTween',
        _('Add object variable tween'),
        _('Add a tween animation for an object variable.'),
        _(
          'Tween the variable _PARAM3_ of _PARAM0_ from _PARAM4_ to _PARAM5_ with easing _PARAM6_ over _PARAM7_ms as _PARAM2_'
        ),
        _('Variables'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('objectvar', _('Object variable'), '', false)
      .addParameter('expression', _('From value'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addVariableTween');

    // Deprecated
    behavior
      .addAction(
        'AddObjectVariableTween2',
        _('Tween a number in an object variable'),
        _(
          "Tweens an object variable's numeric value from its current value to a new one."
        ),
        _(
          'Tween the variable _PARAM3_ of _PARAM0_ to _PARAM4_ with easing _PARAM5_ over _PARAM6_ms as _PARAM2_'
        ),
        _('Variables'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('objectvar', _('Object variable'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addVariableTween2');

    behavior
      .addScopedAction(
        'AddObjectVariableTween3',
        _('Tween a number in an object variable'),
        _(
          "Tweens an object variable's numeric value from its current value to a new one."
        ),
        _(
          'Tween the variable _PARAM3_ of _PARAM0_ to _PARAM4_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM2_'
        ),
        _('Variables'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('objectvar', _('Object variable'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addVariableTween3');

    behavior
      .addScopedAction(
        'AddObjectValueTween',
        _('Tween an object value'),
        _(
          'Tweens an object value that can be use with the object expression Tween::Value.'
        ),
        _(
          'Tween the value of _PARAM0_ from _PARAM3_ to _PARAM4_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM2_'
        ),
        _('Variables'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('From value'), '', false)
      .addParameter('expression', _('To value'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter('yesorno', _('Exponential interpolation'), '', false)
      .setDefaultValue('no')
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addValueTween');

    // deprecated
    behavior
      .addAction(
        'AddObjectPositionTween',
        _('Tween object position'),
        _('Tweens an object position from its current position to a new one.'),
        _(
          'Tween the position of _PARAM0_ to x: _PARAM3_, y: _PARAM4_ with easing _PARAM5_ over _PARAM6_ms as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To X'), '', false)
      .addParameter('expression', _('To Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionTween');

    behavior
      .addScopedAction(
        'AddObjectPositionTween2',
        _('Tween object position'),
        _('Tweens an object position from its current position to a new one.'),
        _(
          'Tween the position of _PARAM0_ to x: _PARAM3_, y: _PARAM4_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To X'), '', false)
      .addParameter('expression', _('To Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectPositionXTween',
        _('Tween object X position'),
        _(
          'Tweens an object X position from its current X position to a new one.'
        ),
        _(
          'Tween the X position of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To X'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionXTween');

    behavior
      .addScopedAction(
        'AddObjectPositionXTween2',
        _('Tween object X position'),
        _(
          'Tweens an object X position from its current X position to a new one.'
        ),
        _(
          'Tween the X position of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To X'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionXTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectPositionZTween',
        _('Tween object Z position'),
        _(
          'Tweens an object Z position (3D objects only) from its current Z position to a new one.'
        ),
        _(
          'Tween the Z position of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Z'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionZTween');

    behavior
      .addAction(
        'AddObjectPositionZTween2',
        _('Tween object Z position'),
        _(
          'Tweens an object Z position (3D objects only) from its current Z position to a new one.'
        ),
        _(
          'Tween the Z position of _PARAM0_ to _PARAM4_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM3_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('behavior', _('3D capability'), 'Scene3D::Base3DBehavior')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Z'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionZTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectWidthTween',
        _('Tween object width'),
        _('Tweens an object width from its current width to a new one.'),
        _(
          'Tween the width of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To width'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectWidthTween');

    behavior
      .addScopedAction(
        'AddObjectWidthTween2',
        _('Tween object width'),
        _('Tweens an object width from its current width to a new one.'),
        _(
          'Tween the width of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To width'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectWidthTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectHeightTween',
        _('Tween object height'),
        _('Tweens an object height from its current height to a new one.'),
        _(
          'Tween the height of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To height'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectHeightTween');

    behavior
      .addScopedAction(
        'AddObjectHeightTween2',
        _('Tween object height'),
        _('Tweens an object height from its current height to a new one.'),
        _(
          'Tween the height of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To height'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectHeightTween2');

    // deprecated use the 3D Tween extension
    behavior
      .addAction(
        'AddObjectDepthTween',
        _('Tween object depth'),
        _(
          'Tweens an object depth (suitable 3D objects only) from its current depth to a new one.'
        ),
        _(
          'Tween the depth of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To depth'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectDepthTween');

    behavior
      .addAction(
        'AddObjectDepthTween2',
        _('Tween object depth'),
        _(
          'Tweens an object depth (suitable 3D objects only) from its current depth to a new one.'
        ),
        _(
          'Tween the depth of _PARAM0_ to _PARAM4_ with easing _PARAM5_ over _PARAM6_ seconds as _PARAM3_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('behavior', _('3D capability'), 'Scene3D::Base3DBehavior')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To depth'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectDepthTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectPositionYTween',
        _('Tween object Y position'),
        _(
          'Tweens an object Y position from its current Y position to a new one.'
        ),
        _(
          'Tween the Y position of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionYTween');

    behavior
      .addScopedAction(
        'AddObjectPositionYTween2',
        _('Tween object Y position'),
        _(
          'Tweens an object Y position from its current Y position to a new one.'
        ),
        _(
          'Tween the Y position of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Position'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectPositionYTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectAngleTween',
        _('Tween object angle'),
        _('Tweens an object angle from its current angle to a new one.'),
        _(
          'Tween the angle of _PARAM0_ to _PARAM3_° with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Angle'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To angle (in degrees)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectAngleTween');

    behavior
      .addScopedAction(
        'AddObjectAngleTween2',
        _('Tween object angle'),
        _('Tweens an object angle from its current angle to a new one.'),
        _(
          'Tween the angle of _PARAM0_ to _PARAM3_° with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Angle'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To angle (in degrees)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectAngleTween2');

    behavior
      .addScopedAction(
        'AddObjectRotationXTween',
        _('Tween object rotation on X axis'),
        _(
          'Tweens an object rotation on X axis from its current angle to a new one.'
        ),
        _(
          'Tween the rotation on X axis of _PARAM0_ to _PARAM4_° with easing _PARAM5_ over _PARAM6_ seconds as _PARAM3_'
        ),
        _('Angle'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('behavior', _('3D capability'), 'Scene3D::Base3DBehavior')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To angle (in degrees)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectRotationXTween');

    behavior
      .addScopedAction(
        'AddObjectRotationYTween',
        _('Tween object rotation on Y axis'),
        _(
          'Tweens an object rotation on Y axis from its current angle to a new one.'
        ),
        _(
          'Tween the rotation on Y axis of _PARAM0_ to _PARAM4_° with easing _PARAM5_ over _PARAM6_ seconds as _PARAM3_'
        ),
        _('Angle'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('behavior', _('3D capability'), 'Scene3D::Base3DBehavior')
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To angle (in degrees)'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectRotationYTween');

    // deprecated
    behavior
      .addAction(
        'AddObjectScaleTween',
        _('Tween object scale'),
        _(
          'Tweens an object scale from its current scale to a new one (note: the scale can never be less than 0).'
        ),
        _(
          'Tween the scale of _PARAM0_ to X-scale: _PARAM3_, Y-scale: _PARAM4_ (from center: _PARAM8_) with easing _PARAM5_ over _PARAM6_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale X'), '', false)
      .addParameter('expression', _('To scale Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleTween');

    // deprecated
    behavior
      .addScopedAction(
        'AddObjectScaleTween2',
        _('Tween object scale'),
        _(
          'Tweens an object scale from its current scale to a new one (note: the scale can never be 0 or less).'
        ),
        _(
          'Tween the scale of _PARAM0_ to X-scale: _PARAM3_, Y-scale: _PARAM4_ (from center: _PARAM8_) with easing _PARAM5_ over _PARAM6_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale X'), '', false)
      .addParameter('expression', _('To scale Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleTween2');

    behavior
      .addScopedAction(
        'AddObjectScaleTween3',
        _('Tween object scale'),
        _(
          'Tweens an object scale from its current value to a new one (note: the scale can never be 0 or less).'
        ),
        _(
          'Tween the scale of _PARAM0_ to _PARAM3_ (from center: _PARAM7_) with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleTween3');

    // deprecated
    behavior
      .addAction(
        'AddObjectScaleXTween',
        _('Tween object X-scale'),
        _(
          'Tweens an object X-scale from its current value to a new one (note: the scale can never be less than 0).'
        ),
        _(
          'Tween the X-scale of _PARAM0_ to _PARAM3_ (from center: _PARAM7_) with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale X'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleXTween');

    behavior
      .addScopedAction(
        'AddObjectScaleXTween2',
        _('Tween object X-scale'),
        _(
          'Tweens an object X-scale from its current value to a new one (note: the scale can never be 0 or less).'
        ),
        _(
          'Tween the X-scale of _PARAM0_ to _PARAM3_ (from center: _PARAM7_) with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale X'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleXTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectScaleYTween',
        _('Tween object Y-scale'),
        _(
          'Tweens an object Y-scale from its current value to a new one (note: the scale can never be less than 0).'
        ),
        _(
          'Tween the Y-scale of _PARAM0_ to _PARAM3_ (from center: _PARAM7_) with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleYTween');

    behavior
      .addScopedAction(
        'AddObjectScaleYTween2',
        _('Tween object Y-scale'),
        _(
          'Tweens an object Y-scale from its current value to a new one (note: the scale can never be 0 or less).'
        ),
        _(
          'Tween the Y-scale of _PARAM0_ to _PARAM3_ (from center: _PARAM7_) with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Size'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To scale Y'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter('yesorno', _('Scale from center of object'), '', false)
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectScaleYTween2');

    // deprecated
    behavior
      .addAction(
        'AddTextObjectCharacterSizeTween',
        _('Tween text size'),
        _(
          'Tweens the text object character size from its current value to a new one (note: the size can never be less than 1).'
        ),
        _(
          'Tween the character size of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Text'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Text object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To character size'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addTextObjectCharacterSizeTween');

    behavior
      .addScopedAction(
        'AddTextObjectCharacterSizeTween2',
        _('Tween text size'),
        _(
          'Tweens the text object character size from its current value to a new one (note: the size can never be less than 1).'
        ),
        _(
          'Tween the character size of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Text'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Text object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To character size'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addTextObjectCharacterSizeTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectOpacityTween',
        _('Tween object opacity'),
        _(
          'Tweens the object opacity from its current value to a new one (note: the value shall stay between 0 and 255).'
        ),
        _(
          'Tween the opacity of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Visibility'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To opacity'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectOpacityTween');

    behavior
      .addScopedAction(
        'AddObjectOpacityTween2',
        _('Tween object opacity'),
        _(
          'Tweens the object opacity from its current value to a new one (note: the value shall stay between 0 and 255).'
        ),
        _(
          'Tween the opacity of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_ and destroy: _PARAM6_'
        ),
        _('Visibility'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHint(
        "Tweening opacity only works on 2D objects, it has no effect/won't run on 3D objects."
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To opacity'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectOpacityTween2');

    behavior
      .addScopedAction(
        'AddNumberEffectPropertyTween',
        _('Tween number effect property'),
        _(
          'Tweens a number effect property from its current value to a new one.'
        ),
        _(
          'Tween the property _PARAM6_ for effect _PARAM5_ of _PARAM0_ to _PARAM4_ with easing _PARAM7_ over _PARAM8_ seconds as _PARAM3_'
        ),
        _('Effects'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter(
        'behavior',
        _('Effect capability'),
        'EffectCapability::EffectBehavior'
      )
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To value'), '', false)
      .addParameter('objectEffectName', _('Effect name'))
      .addParameter('objectEffectParameterName', _('Property name'))
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addNumberEffectPropertyTween');

    behavior
      .addScopedAction(
        'AddColorEffectPropertyTween',
        _('Tween color effect property'),
        _(
          'Tweens a color effect property from its current value to a new one.'
        ),
        _(
          'Tween the color property _PARAM6_ for effect _PARAM5_ of _PARAM0_ to _PARAM4_ with easing _PARAM7_ over _PARAM8_ seconds as _PARAM3_'
        ),
        _('Effects'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter(
        'behavior',
        _('Effect capability'),
        'EffectCapability::EffectBehavior'
      )
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('color', _('To color'), '', false)
      .addParameter('objectEffectName', _('Effect name'))
      .addParameter('objectEffectParameterName', _('Property name'))
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addColorEffectPropertyTween');

    // deprecated
    behavior
      .addAction(
        'AddObjectColorTween',
        _('Tween object color'),
        _(
          'Tweens the object color from its current value to a new one. Format: "128;200;255" with values between 0 and 255 for red, green and blue'
        ),
        _(
          'Tween the color of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ms as _PARAM2_'
        ),
        _('Color'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('color', _('To color'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter(
        'yesorno',
        _('Tween on the Hue/Saturation/Lightness (HSL)'),
        '',
        false
      )
      .setParameterLongDescription(
        _('Useful to have a more natural change between colors.')
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectColorTween');

    behavior
      .addScopedAction(
        'AddObjectColorTween2',
        _('Tween object color'),
        _(
          'Tweens the object color from its current value to a new one. Format: "128;200;255" with values between 0 and 255 for red, green and blue'
        ),
        _(
          'Tween the color of _PARAM0_ to _PARAM3_ with easing _PARAM4_ over _PARAM5_ seconds as _PARAM2_'
        ),
        _('Color'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('color', _('To color'), '', false)
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .addParameter(
        'yesorno',
        _('Tween on the Hue/Saturation/Lightness (HSL)'),
        '',
        false
      )
      .setParameterLongDescription(
        _('Useful to have a more natural change between colors.')
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectColorTween2');

    // deprecated
    behavior
      .addAction(
        'AddObjectColorHSLTween',
        _('Tween object HSL color'),
        _(
          'Tweens the object color using Hue/Saturation/Lightness. Hue is in degrees, Saturation and Lightness are between 0 and 100. Use -1 for Saturation and Lightness to let them unchanged.'
        ),
        _(
          'Tween the color of _PARAM0_ using HSL to H: _PARAM3_ (_PARAM4_), S: _PARAM5_, L: _PARAM6_ with easing _PARAM7_ over _PARAM8_ms as _PARAM2_'
        ),
        _('Color'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .setHidden()
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Hue (in degrees)'), '', false)
      .addParameter('yesorno', _('Animate Hue'), '', false)
      .setDefaultValue('yes')
      .addParameter(
        'expression',
        _('To Saturation (0 to 100, -1 to ignore)'),
        '',
        false
      )
      .setDefaultValue('-1')
      .addParameter(
        'expression',
        _('To Lightness (0 to 100, -1 to ignore)'),
        '',
        false
      )
      .setDefaultValue('-1')
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in milliseconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectColorHSLTween');

    behavior
      .addScopedAction(
        'AddObjectColorHSLTween2',
        _('Tween object HSL color'),
        _(
          'Tweens the object color using Hue/Saturation/Lightness. Hue is in degrees, Saturation and Lightness are between 0 and 100. Use -1 for Saturation and Lightness to let them unchanged.'
        ),
        _(
          'Tween the color of _PARAM0_ using HSL to H: _PARAM3_ (_PARAM4_), S: _PARAM5_, L: _PARAM6_ with easing _PARAM7_ over _PARAM8_ seconds as _PARAM2_'
        ),
        _('Color'),
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('expression', _('To Hue (in degrees)'), '', false)
      .addParameter('yesorno', _('Animate Hue'), '', false)
      .setDefaultValue('yes')
      .addParameter(
        'expression',
        _('To Saturation (0 to 100, -1 to ignore)'),
        '',
        false
      )
      .setDefaultValue('-1')
      .addParameter(
        'expression',
        _('To Lightness (0 to 100, -1 to ignore)'),
        '',
        false
      )
      .setDefaultValue('-1')
      .addParameter('stringWithSelector', _('Easing'), easingChoices, false)
      .setDefaultValue('linear')
      .addParameter('expression', _('Duration (in seconds)'), '', false)
      .addParameter(
        'yesorno',
        _('Destroy this object when tween finishes'),
        '',
        false
      )
      .setDefaultValue('no')
      .getCodeExtraInformation()
      .setFunctionName('addObjectColorHSLTween2');

    behavior
      .addCondition(
        'Exists',
        _('Tween exists'),
        _('Check if the tween animation exists.'),
        _('Tween _PARAM2_ on _PARAM0_ exists'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('exists');

    behavior
      .addCondition(
        'IsPlaying',
        _('Tween is playing'),
        _('Check if the tween animation is currently playing.'),
        _('Tween _PARAM2_ on _PARAM0_ is playing'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('isPlaying');

    behavior
      .addCondition(
        'HasFinished',
        _('Tween finished playing'),
        _('Check if the tween animation has finished playing.'),
        _('Tween _PARAM2_ on _PARAM0_ has finished playing'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('hasFinished');

    behavior
      .addAction(
        'PauseTween',
        _('Pause a tween'),
        _('Pause the running tween animation.'),
        _('Pause the tween _PARAM2_ on _PARAM0_'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('pauseTween');

    behavior
      .addAction(
        'StopTween',
        _('Stop a tween'),
        _('Stop the running tween animation.'),
        _('Stop the tween _PARAM2_ on _PARAM0_'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .addParameter('yesorno', _('Jump to end'), '', false)
      .getCodeExtraInformation()
      .setFunctionName('stopTween');

    behavior
      .addAction(
        'ResumeTween',
        _('Resume a tween'),
        _('Resume the tween animation.'),
        _('Resume the tween _PARAM2_ on _PARAM0_'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('resumeTween');

    behavior
      .addAction(
        'RemoveTween',
        _('Remove a tween'),
        _('Remove the tween animation from the object.'),
        _('Remove the tween _PARAM2_ from _PARAM0_'),
        '',
        'JsPlatform/Extensions/tween_behavior24.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('removeTween');

    behavior
      .addExpressionAndCondition(
        'number',
        'Progress',
        _('Tween progress'),
        _('the progress of a tween (between 0.0 and 1.0)'),
        _('the progress of the tween _PARAM2_'),
        '',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .useStandardParameters('number', gd.ParameterOptions.makeNewOptions())
      .setFunctionName('getProgress');

    behavior
      .addExpression(
        'Value',
        _('Tween value'),
        _(
          'Return the value of a tween. It is always 0 for tweens with several values.'
        ),
        '',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('object', _('Object'), '', false)
      .addParameter('behavior', _('Behavior'), 'TweenBehavior', false)
      .addParameter('identifier', _('Tween Identifier'), 'objectTween')
      .getCodeExtraInformation()
      .setFunctionName('getValue');

    return extension;
  },

  runExtensionSanityTests: function (gd, extension) {
    return [];
  },
};

// TweenBehavior/TweenManager.js
var gdjs;(function(u){let I;(function(w){let p;(function(d){/*!
 * All equations are adapted from Thomas Fuchs'
 * [Scripty2](https://github.com/madrobby/scripty2/blob/master/src/effects/transitions/penner.js).
 *
 * Based on Easing Equations (c) 2003 [Robert
 * Penner](http://www.robertpenner.com/), all rights reserved. This work is
 * [subject to terms](http://www.robertpenner.com/easing_terms_of_use.html).
 *//*!
 *  TERMS OF USE - EASING EQUATIONS
 *  Open source under the BSD License.
 *  Easing Equations (c) 2003 Robert Penner, all rights reserved.
 *//*! Shifty 3.0.3 - https://github.com/jeremyckahn/shifty */d.easingFunctions={linear:e=>e,easeInQuad:e=>Math.pow(e,2),easeOutQuad:e=>-(Math.pow(e-1,2)-1),easeInOutQuad:e=>(e/=.5)<1?.5*Math.pow(e,2):-.5*((e-=2)*e-2),easeInCubic:e=>Math.pow(e,3),easeOutCubic:e=>Math.pow(e-1,3)+1,easeInOutCubic:e=>(e/=.5)<1?.5*Math.pow(e,3):.5*(Math.pow(e-2,3)+2),easeInQuart:e=>Math.pow(e,4),easeOutQuart:e=>-(Math.pow(e-1,4)-1),easeInOutQuart:e=>(e/=.5)<1?.5*Math.pow(e,4):-.5*((e-=2)*Math.pow(e,3)-2),easeInQuint:e=>Math.pow(e,5),easeOutQuint:e=>Math.pow(e-1,5)+1,easeInOutQuint:e=>(e/=.5)<1?.5*Math.pow(e,5):.5*(Math.pow(e-2,5)+2),easeInSine:e=>-Math.cos(e*(Math.PI/2))+1,easeOutSine:e=>Math.sin(e*(Math.PI/2)),easeInOutSine:e=>-.5*(Math.cos(Math.PI*e)-1),easeInExpo:e=>e===0?0:Math.pow(2,10*(e-1)),easeOutExpo:e=>e===1?1:-Math.pow(2,-10*e)+1,easeInOutExpo:e=>e===0?0:e===1?1:(e/=.5)<1?.5*Math.pow(2,10*(e-1)):.5*(-Math.pow(2,-10*--e)+2),easeInCirc:e=>-(Math.sqrt(1-e*e)-1),easeOutCirc:e=>Math.sqrt(1-Math.pow(e-1,2)),easeInOutCirc:e=>(e/=.5)<1?-.5*(Math.sqrt(1-e*e)-1):.5*(Math.sqrt(1-(e-=2)*e)+1),easeOutBounce:e=>e<1/2.75?7.5625*e*e:e<2/2.75?7.5625*(e-=1.5/2.75)*e+.75:e<2.5/2.75?7.5625*(e-=2.25/2.75)*e+.9375:7.5625*(e-=2.625/2.75)*e+.984375,easeInBack:e=>{const t=1.70158;return e*e*((t+1)*e-t)},easeOutBack:e=>{const t=1.70158;return(e=e-1)*e*((t+1)*e+t)+1},easeInOutBack:e=>{let t=1.70158;return(e/=.5)<1?.5*(e*e*(((t*=1.525)+1)*e-t)):.5*((e-=2)*e*(((t*=1.525)+1)*e+t)+2)},elastic:e=>-1*Math.pow(4,-8*e)*Math.sin((e*6-1)*(2*Math.PI)/2)+1,swingFromTo:e=>{let t=1.70158;return(e/=.5)<1?.5*(e*e*(((t*=1.525)+1)*e-t)):.5*((e-=2)*e*(((t*=1.525)+1)*e+t)+2)},swingFrom:e=>{const t=1.70158;return e*e*((t+1)*e-t)},swingTo:e=>{const t=1.70158;return(e-=1)*e*((t+1)*e+t)+1},bounce:e=>e<1/2.75?7.5625*e*e:e<2/2.75?7.5625*(e-=1.5/2.75)*e+.75:e<2.5/2.75?7.5625*(e-=2.25/2.75)*e+.9375:7.5625*(e-=2.625/2.75)*e+.984375,bouncePast:e=>e<1/2.75?7.5625*e*e:e<2/2.75?2-(7.5625*(e-=1.5/2.75)*e+.75):e<2.5/2.75?2-(7.5625*(e-=2.25/2.75)*e+.9375):2-(7.5625*(e-=2.625/2.75)*e+.984375),easeFromTo:e=>(e/=.5)<1?.5*Math.pow(e,4):-.5*((e-=2)*Math.pow(e,3)-2),easeFrom:e=>Math.pow(e,4),easeTo:e=>Math.pow(e,.25)};class V{constructor(){this._tweens=new Map;this._activeTweens=new Array}step(){let t=0;for(let n=0;n<this._activeTweens.length;n++){const i=this._activeTweens[n];i.step(),i.hasFinished()||(this._activeTweens[t]=i,t++)}this._activeTweens.length=t}addSimpleTween(t,n,i,r,o,a,s,h,c,m){const f=d.easingFunctions[r];if(!f)return;this.removeTween(t);const l=new v(n,i,f,r,o,a,s,h,c,m);this._tweens.set(t,l),this._addActiveTween(l)}addMultiTween(t,n,i,r,o,a,s,h,c,m){const f=d.easingFunctions[r];if(!f)return;this.removeTween(t);const l=new M(n,i,f,r,o,a,s,h,c,m);this._tweens.set(t,l),this._addActiveTween(l)}exists(t){return this._tweens.has(t)}isPlaying(t){const n=this._tweens.get(t);return!!n&&n.isPlaying()}hasFinished(t){const n=this._tweens.get(t);return!!n&&n.hasFinished()}pauseTween(t){const n=this._tweens.get(t);!n||!n.isPlaying()||n.hasFinished()||(this._removeActiveTween(n),n.pause())}resumeTween(t){const n=this._tweens.get(t);!n||n.isPlaying()||n.hasFinished()||(this._addActiveTween(n),n.resume())}stopTween(t,n){const i=this._tweens.get(t);!i||i.hasFinished()||(i.isPlaying()&&this._removeActiveTween(i),i.stop(n))}removeTween(t){const n=this._tweens.get(t);!n||(n.isPlaying()&&this._removeActiveTween(n),this._tweens.delete(t))}_addActiveTween(t){this._activeTweens.push(t)}_removeActiveTween(t){const n=this._activeTweens.findIndex(i=>i===t);this._activeTweens.splice(n,1)}getProgress(t){const n=this._tweens.get(t);return n?n.getProgress():0}getValue(t){const n=this._tweens.get(t);return n?n.getValue():0}getNetworkSyncData(){const t={tweens:{}};return this._tweens.forEach((n,i)=>{t.tweens[i]=n.getNetworkSyncData()}),t}updateFromNetworkSyncData(t,n,i,r){Object.entries(t.tweens).forEach(([o,a])=>{const s=n(a.tweenInformation),h=i(a.tweenInformation),c=r(a.tweenInformation),m=a.interpolationString==="exponential"?u.evtTools.common.exponentialInterpolation:u.evtTools.common.lerp,f={type:a.tweenInformation.type,layerName:a.tweenInformation.layerName,effectName:a.tweenInformation.effectName,propertyName:a.tweenInformation.propertyName,scaleFromCenterOfObject:a.tweenInformation.scaleFromCenterOfObject,useHSLColorTransition:a.tweenInformation.useHSLColorTransition,destroyObjectWhenFinished:a.tweenInformation.destroyObjectWhenFinished};if(a.tweenInformation.variablePath&&(s instanceof u.RuntimeScene||s instanceof u.RuntimeObject)){const l=s.getVariables().getVariableFromPath(a.tweenInformation.variablePath);l&&(f.variable=l)}if(typeof a.initialValue=="number"&&typeof a.targetedValue=="number"){this.addSimpleTween(o,s,a.totalDuration,a.easingIdentifier,m,a.initialValue,a.targetedValue,h,f,c);const l=this._tweens.get(o);l&&(l.updateElapsedTime(a.elapsedTime),a.isPaused&&this.pauseTween(o))}else if(Array.isArray(a.initialValue)&&Array.isArray(a.targetedValue)){this.addMultiTween(o,s,a.totalDuration,a.easingIdentifier,m,a.initialValue,a.targetedValue,h,f,c);const l=this._tweens.get(o);l&&(l.updateElapsedTime(a.elapsedTime),a.isPaused&&this.pauseTween(o))}})}}d.TweenManager=V;const b=()=>{};class T{constructor(t,n,i,r,o,a,s){this.isPaused=!1;this.timeSource=t,this.totalDuration=n,this.easing=i,this.easingIdentifier=r,this.interpolate=o,this.tweenInformation=a,this.elapsedTime=0,this.onFinish=s||b}step(){!this.isPlaying()||(this.elapsedTime=Math.min(this.elapsedTime+this.timeSource.getElapsedTime()/1e3,this.totalDuration),this._updateValue())}isPlaying(){return!this.isPaused&&!this.hasFinished()}hasFinished(){return this.elapsedTime===this.totalDuration}stop(t){this.elapsedTime=this.totalDuration,t&&this._updateValue()}resume(){this.isPaused=!1}pause(){this.isPaused=!0}getProgress(){return this.elapsedTime/this.totalDuration}updateElapsedTime(t){this.elapsedTime=t}}d.AbstractTweenInstance=T;class v extends T{constructor(t,n,i,r,o,a,s,h,c,m){super(t,n,i,r,o,c,m);this.initialValue=a,this.currentValue=a,this.targetedValue=s,this.setValue=h}_updateValue(){const t=this.easing(this.getProgress()),n=this.interpolate(this.initialValue,this.targetedValue,t);this.currentValue=n,this.setValue(n),this.hasFinished()&&this.onFinish()}getValue(){return this.currentValue}getNetworkSyncData(){const t=this.interpolate===u.evtTools.common.exponentialInterpolation?"exponential":"linear",n={type:this.tweenInformation.type,layerName:this.tweenInformation.layerName,effectName:this.tweenInformation.effectName,propertyName:this.tweenInformation.propertyName,scaleFromCenterOfObject:this.tweenInformation.scaleFromCenterOfObject,useHSLColorTransition:this.tweenInformation.useHSLColorTransition,destroyObjectWhenFinished:this.tweenInformation.destroyObjectWhenFinished};if(this.tweenInformation.variable&&(this.timeSource instanceof u.RuntimeScene||this.timeSource instanceof u.RuntimeObject)){const i=this.timeSource.getVariables().getVariablePathInContainerByLoopingThroughAllVariables(this.tweenInformation.variable);i&&(n.variablePath=i)}return{initialValue:this.initialValue,targetedValue:this.targetedValue,elapsedTime:this.elapsedTime,totalDuration:this.totalDuration,easingIdentifier:this.easingIdentifier,interpolationString:t,isPaused:this.isPaused,tweenInformation:n}}}d.SimpleTweenInstance=v;class M extends T{constructor(t,n,i,r,o,a,s,h,c,m){super(t,n,i,r,o,c,m);this.currentValues=new Array;this.initialValue=a,this.targetedValue=s,this.setValue=h}_updateValue(){const t=this.easing(this.getProgress()),n=this.initialValue.length;this.currentValues.length=n;for(let i=0;i<n;i++)this.currentValues[i]=this.interpolate(this.initialValue[i],this.targetedValue[i],t);this.setValue(this.currentValues),this.hasFinished()&&this.onFinish()}getValue(){return 0}getNetworkSyncData(){const t=this.interpolate===u.evtTools.common.exponentialInterpolation?"exponential":"linear";return{initialValue:this.initialValue,targetedValue:this.targetedValue,elapsedTime:this.elapsedTime,totalDuration:this.totalDuration,easingIdentifier:this.easingIdentifier,interpolationString:t,isPaused:this.isPaused,tweenInformation:this.tweenInformation}}}d.MultiTweenInstance=M,d.rgbToHsl=(e,t,n)=>{e/=255,t/=255,n/=255;let i=Math.max(e,t,n),r=i-Math.min(e,t,n),o=1-Math.abs(i+i-r-1),a=r&&(i===e?(t-n)/r:i===t?2+(n-e)/r:4+(e-t)/r);return[Math.round(60*(a<0?a+6:a)),Math.round((o?r/o:0)*100),Math.round((i+i-r)/2*100)]},d.hslToRgb=(e,t,n)=>{e=e%=360,e<0&&(e+=360),t=t/100,n=n/100;const i=t*Math.min(n,1-n),r=(o=0,a=(o+e/30)%12)=>n-i*Math.max(Math.min(a-3,9-a,1),-1);return[Math.round(r(0)*255),Math.round(r(8)*255),Math.round(r(4)*255)]},d.ease=(e,t,n,i)=>{const r=u.evtTools.tween.easingFunctions,o=r.hasOwnProperty(e)?r[e]:r.linear;return t+(n-t)*o(i)}})(p=w.tween||(w.tween={}))})(I=u.evtTools||(u.evtTools={}))})(gdjs||(gdjs={}));
//# sourceMappingURL=TweenManager.js.map

// TweenBehavior/tweenruntimebehavior.js
var gdjs;(function(d){const S=new d.Logger("Tween");function T(i){return i.setScaleX&&i.setScaleY&&i.getScaleX&&i.getScaleY}function j(i){return i.setOpacity&&i.getOpacity}function u(i){return i.getZ&&i.setZ}function m(i){return i.setColor&&i.getColor}function O(i){return i.setCharacterSize&&i.getCharacterSize}const g=d.evtTools.common.lerp,h=d.evtTools.common.exponentialInterpolation,_=()=>{},p=i=>e=>i.setNumber(e),v=i=>e=>i.setX(e),C=i=>e=>i.setY(e),R=i=>u(i)?e=>i.setZ(e):()=>{},y=i=>([e,t])=>i.setPosition(e,t),P=i=>e=>i.setAngle(e),X=i=>e=>i.setWidth(e),Y=i=>e=>i.setHeight(e),D=i=>e=>i.setRotationX(e),H=i=>e=>i.setRotationY(e),B=i=>e=>i.setDepth(e),I=(i,e)=>e?([t,o])=>{const r=i.getCenterXInScene(),n=i.getCenterYInScene();i.setScaleX(t),i.setScaleY(o),i.setCenterPositionInScene(r,n)}:([t,o])=>{i.setScaleX(t),i.setScaleY(o)},x=(i,e,t)=>t?o=>{const r=i.getCenterXInScene(),n=i.getCenterYInScene(),a=e?e.getCenterZInScene():0;i.setScale(o),i.setCenterXInScene(r),i.setCenterYInScene(n),e&&e.setCenterZInScene(a)}:o=>i.setScale(o),M=(i,e)=>e?t=>{const o=i.getCenterXInScene();i.setScaleX(t),i.setCenterXInScene(o)}:t=>i.setScaleX(t),V=(i,e)=>e?t=>{const o=i.getCenterYInScene();i.setScaleY(t),i.setCenterYInScene(o)}:t=>i.setScaleY(t),F=i=>e=>i.setOpacity(e),N=i=>e=>i.setCharacterSize(e),A=(i,e)=>t=>{i.updateDoubleParameter(e,t)},k=(i,e)=>([t,o,r])=>{const n=d.evtTools.tween.hslToRgb(t,o,r);i.updateColorParameter(e,d.rgbToHexNumber(n[0],n[1],n[2]))},z=(i,e)=>e?([t,o,r])=>{const n=d.evtTools.tween.hslToRgb(t,o,r);i.setColor(Math.floor(n[0])+";"+Math.floor(n[1])+";"+Math.floor(n[2]))}:([t,o,r])=>{i.setColor(Math.floor(t)+";"+Math.floor(o)+";"+Math.floor(r))},Z=i=>([e,t,o])=>{const r=d.evtTools.tween.hslToRgb(e,t,o);i.setColor(Math.floor(r[0])+";"+Math.floor(r[1])+";"+Math.floor(r[2]))},E=i=>e=>{const t=e.type,o=e.variablePath,r=e.effectName,n=e.propertyName,a=!!e.scaleFromCenterOfObject,s=!!e.useHSLColorTransition;if(t==="objectValue")return _;if(t==="variable"&&o){const l=i.getVariables().getVariableFromPath(o);return l?p(l):()=>{}}if(t==="positionX")return v(i);if(t==="positionY")return C(i);if(t==="position")return y(i);if(t==="positionZ")return R(i);if(t==="width")return X(i);if(t==="height")return Y(i);if(t==="depth")return u(i)?B(i):()=>{};if(t==="angle")return P(i);if(t==="rotationX")return u(i)?D(i):()=>{};if(t==="rotationY")return u(i)?H(i):()=>{};if(t==="scale"){if(!T(i))return()=>{};const l=u(i)?i:null;return x(i,l,a)}if(t==="scaleXY")return T(i)?I(i,a):()=>{};if(t==="scaleX")return T(i)?M(i,a):()=>{};if(t==="scaleY")return T(i)?V(i,a):()=>{};if(t==="opacity")return j(i)?F(i):()=>{};if(t==="characterSize")return O(i)?N(i):()=>{};if(t==="numberEffectProperty"&&r&&n){const l=i.getRendererEffects()[r];return l||S.error(`The object "${i.name}" doesn't have any effect called "${r}"`),A(l,n)}if(t==="colorEffectProperty"&&r&&n){const l=i.getRendererEffects()[r];return l||S.error(`The object "${i.name}" doesn't have any effect called "${r}"`),k(l,n)}return t==="objectColor"?m(i)?z(i,s):()=>{}:t==="objectColorHSL"?m(i)?Z(i):()=>{}:()=>{}};class q extends d.RuntimeBehavior{constructor(e,t,o){super(e,t,o);this._tweens=new d.evtTools.tween.TweenManager;this._isActive=!0}applyBehaviorOverriding(e){return!0}getNetworkSyncData(e){return{...super.getNetworkSyncData(e),props:{tweenManager:this._tweens.getNetworkSyncData()}}}updateFromNetworkSyncData(e,t){super.updateFromNetworkSyncData(e,t),e.props.tweenManager&&this._tweens.updateFromNetworkSyncData(e.props.tweenManager,o=>this.owner,o=>E(this.owner)(o),o=>o.destroyObjectWhenFinished?()=>this._deleteFromScene():null)}doStepPreEvents(e){this._tweens.step()}_deleteFromScene(){this.owner.deleteFromScene()}addVariableTween(e,t,o,r,n,a,s){this._tweens.addSimpleTween(e,this.owner.getRuntimeScene(),a/1e3,n,g,o,r,p(t),{type:"variable",variable:t,destroyObjectWhenFinished:s},s?()=>this._deleteFromScene():null)}addVariableTween2(e,t,o,r,n,a){this._addVariableTween(e,t,o,r,n/1e3,a,this.owner.getRuntimeScene())}addVariableTween3(e,t,o,r,n,a){this._addVariableTween(e,t,o,r,n,a,this.owner)}_addVariableTween(e,t,o,r,n,a,s){t.getType()==="number"&&this._tweens.addSimpleTween(e,s,n,r,g,t.getValue(),o,p(t),{type:"variable",variable:t,destroyObjectWhenFinished:a},a?()=>this._deleteFromScene():null)}addValueTween(e,t,o,r,n,a,s){this._tweens.addSimpleTween(e,this.owner,n,r,a?h:g,t,o,_,{type:"objectValue",destroyObjectWhenFinished:s},s?()=>this._deleteFromScene():null)}addObjectPositionTween(e,t,o,r,n,a){this._addObjectPositionTween(e,t,o,r,n/1e3,a,this.owner.getRuntimeScene())}addObjectPositionTween2(e,t,o,r,n,a){this._addObjectPositionTween(e,t,o,r,n,a,this.owner)}_addObjectPositionTween(e,t,o,r,n,a,s){this._tweens.addMultiTween(e,s,n,r,g,[this.owner.getX(),this.owner.getY()],[t,o],y(this.owner),{type:"position",destroyObjectWhenFinished:a},a?()=>this._deleteFromScene():null)}addObjectPositionXTween(e,t,o,r,n){this._addObjectPositionXTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectPositionXTween2(e,t,o,r,n){this._addObjectPositionXTween(e,t,o,r,n,this.owner)}_addObjectPositionXTween(e,t,o,r,n,a){this._tweens.addSimpleTween(e,a,r,o,g,this.owner.getX(),t,v(this.owner),{type:"positionX",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectPositionYTween(e,t,o,r,n){this._addObjectPositionYTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectPositionYTween2(e,t,o,r,n){this._addObjectPositionYTween(e,t,o,r,n,this.owner)}_addObjectPositionYTween(e,t,o,r,n,a){this._tweens.addSimpleTween(e,a,r,o,g,this.owner.getY(),t,C(this.owner),{type:"positionY",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectPositionZTween(e,t,o,r,n){this._addObjectPositionZTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectPositionZTween2(e,t,o,r,n,a){this._addObjectPositionZTween(t,o,r,n,a,this.owner)}_addObjectPositionZTween(e,t,o,r,n,a){const{owner:s}=this;!u(s)||this._tweens.addSimpleTween(e,a,r,o,g,s.getZ(),t,R(s),{type:"positionZ",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectAngleTween(e,t,o,r,n){this._addObjectAngleTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectAngleTween2(e,t,o,r,n){this._addObjectAngleTween(e,t,o,r,n,this.owner)}_addObjectAngleTween(e,t,o,r,n,a){this._tweens.addSimpleTween(e,a,r,o,g,this.owner.getAngle(),t,P(this.owner),{type:"angle",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectRotationXTween(e,t,o,r,n,a){const{owner:s}=this;!u(s)||this._tweens.addSimpleTween(t,this.owner,n,r,g,s.getRotationX(),o,D(s),{type:"rotationX",destroyObjectWhenFinished:a},a?()=>this._deleteFromScene():null)}addObjectRotationYTween(e,t,o,r,n,a){const{owner:s}=this;!u(s)||this._tweens.addSimpleTween(t,this.owner,n,r,g,s.getRotationY(),o,H(s),{type:"rotationY",destroyObjectWhenFinished:a},a?()=>this._deleteFromScene():null)}addObjectScaleTween(e,t,o,r,n,a,s){this._addObjectScaleTween(e,t,o,r,n/1e3,a,s,this.owner.getRuntimeScene(),g)}addObjectScaleTween2(e,t,o,r,n,a,s){this._addObjectScaleTween(e,t,o,r,n,a,s,this.owner,h)}_addObjectScaleTween(e,t,o,r,n,a,s,l,c){const w=this.owner;!T(w)||(t<0&&(t=0),o<0&&(o=0),this._tweens.addMultiTween(e,l,n,r,c,[w.getScaleX(),w.getScaleY()],[t,o],I(w,s),{type:"scaleXY",destroyObjectWhenFinished:a},a?()=>this._deleteFromScene():null))}addObjectScaleTween3(e,t,o,r,n,a){this._addObjectScaleXTween(e,t,o,r,n,a,this.owner,h);const s=this.owner;if(!T(s))return;const l=u(s)?s:null;this._tweens.addSimpleTween(e,this.owner,r,o,h,s.getScale(),t,x(s,l,a),{type:"scale",scaleFromCenterOfObject:a,destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectScaleXTween(e,t,o,r,n,a){this._addObjectScaleXTween(e,t,o,r/1e3,n,a,this.owner.getRuntimeScene(),g)}addObjectScaleXTween2(e,t,o,r,n,a){this._addObjectScaleXTween(e,t,o,r,n,a,this.owner,h)}_addObjectScaleXTween(e,t,o,r,n,a,s,l){const c=this.owner;!T(c)||this._tweens.addSimpleTween(e,s,r,o,l,c.getScaleX(),t,M(c,a),{type:"scaleX",scaleFromCenterOfObject:a,destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectScaleYTween(e,t,o,r,n,a){this._addObjectScaleYTween(e,t,o,r/1e3,n,a,this.owner.getRuntimeScene(),g)}addObjectScaleYTween2(e,t,o,r,n,a){this._addObjectScaleYTween(e,t,o,r,n,a,this.owner,h)}_addObjectScaleYTween(e,t,o,r,n,a,s,l){const c=this.owner;!T(c)||this._tweens.addSimpleTween(e,s,r,o,l,c.getScaleY(),t,V(c,a),{type:"scaleY",scaleFromCenterOfObject:a,destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectOpacityTween(e,t,o,r,n){this._addObjectOpacityTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectOpacityTween2(e,t,o,r,n){this._addObjectOpacityTween(e,t,o,r,n,this.owner)}_addObjectOpacityTween(e,t,o,r,n,a){const s=this.owner;!j(s)||this._tweens.addSimpleTween(e,a,r,o,g,s.getOpacity(),t,F(s),{type:"opacity",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addNumberEffectPropertyTween(e,t,o,r,n,a,s,l){const c=this.owner.getRendererEffects()[r];c||S.error(`The object "${this.owner.name}" doesn't have any effect called "${r}"`),this._tweens.addSimpleTween(t,this.owner,s,a,g,c?c.getDoubleParameter(n):0,o,A(c,n),{type:"numberEffectProperty",effectName:r,propertyName:n,destroyObjectWhenFinished:l},l?()=>this._deleteFromScene():null)}addColorEffectPropertyTween(e,t,o,r,n,a,s,l){const c=this.owner.getRendererEffects()[r];c||S.error(`The object "${this.owner.name}" doesn't have any effect called "${r}"`);const w=d.hexNumberToRGB(c?c.getColorParameter(n):0),b=d.rgbOrHexToRGBColor(o);this._tweens.addMultiTween(t,this.owner,s,a,g,d.evtTools.tween.rgbToHsl(w.r,w.g,w.b),d.evtTools.tween.rgbToHsl(b[0],b[1],b[2]),k(c,n),{type:"colorEffectProperty",effectName:r,propertyName:n,destroyObjectWhenFinished:l},l?()=>this._deleteFromScene():null)}addObjectColorTween(e,t,o,r,n,a){this._addObjectColorTween(e,t,o,r/1e3,n,a,this.owner.getRuntimeScene())}addObjectColorTween2(e,t,o,r,n,a=!0){this._addObjectColorTween(e,t,o,r,n,a,this.owner)}_addObjectColorTween(e,t,o,r,n,a,s){const l=this.owner;if(!m(l))return;const c=d.rgbOrHexToRGBColor(l.getColor()),w=d.rgbOrHexToRGBColor(t),b=a?d.evtTools.tween.rgbToHsl(c[0],c[1],c[2]):c,f=a?d.evtTools.tween.rgbToHsl(w[0],w[1],w[2]):w;this._tweens.addMultiTween(e,s,r,o,g,b,f,z(l,a),{type:"objectColor",useHSLColorTransition:a,destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectColorHSLTween(e,t,o,r,n,a,s,l){this._addObjectColorHSLTween(e,t,o,r,n,a,s/1e3,l,this.owner.getRuntimeScene())}addObjectColorHSLTween2(e,t,o,r,n,a,s,l){this._addObjectColorHSLTween(e,t,o,r,n,a,s,l,this.owner)}_addObjectColorHSLTween(e,t,o,r,n,a,s,l,c){if(!m(this.owner))return;const w=this.owner,b=d.rgbOrHexToRGBColor(w.getColor()),f=d.evtTools.tween.rgbToHsl(b[0],b[1],b[2]),L=o?t:f[0],$=r===-1?f[1]:Math.min(Math.max(r,0),100),G=n===-1?f[2]:Math.min(Math.max(n,0),100);this._tweens.addMultiTween(e,c,s,a,g,f,[L,$,G],Z(w),{type:"objectColorHSL",destroyObjectWhenFinished:l},l?()=>this._deleteFromScene():null)}addTextObjectCharacterSizeTween(e,t,o,r,n){this._addTextObjectCharacterSizeTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene(),g)}addTextObjectCharacterSizeTween2(e,t,o,r,n){this._addTextObjectCharacterSizeTween(e,t,o,r,n,this.owner,h)}_addTextObjectCharacterSizeTween(e,t,o,r,n,a,s){const l=this.owner;!O(l)||this._tweens.addSimpleTween(e,a,r,o,s,l.getCharacterSize(),t,N(l),{type:"characterSize",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectWidthTween(e,t,o,r,n){this._addObjectWidthTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectWidthTween2(e,t,o,r,n){this._addObjectWidthTween(e,t,o,r,n,this.owner)}_addObjectWidthTween(e,t,o,r,n,a){this._tweens.addSimpleTween(e,a,r,o,g,this.owner.getWidth(),t,X(this.owner),{type:"width",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectHeightTween(e,t,o,r,n){this._addObjectHeightTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectHeightTween2(e,t,o,r,n){this._addObjectHeightTween(e,t,o,r,n,this.owner)}_addObjectHeightTween(e,t,o,r,n,a){this._tweens.addSimpleTween(e,a,r,o,g,this.owner.getHeight(),t,Y(this.owner),{type:"height",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}addObjectDepthTween(e,t,o,r,n){this._addObjectDepthTween(e,t,o,r/1e3,n,this.owner.getRuntimeScene())}addObjectDepthTween2(e,t,o,r,n,a){this._addObjectDepthTween(t,o,r,n,a,this.owner)}_addObjectDepthTween(e,t,o,r,n,a){const{owner:s}=this;!u(s)||this._tweens.addSimpleTween(e,a,r,o,g,s.getDepth(),t,B(s),{type:"depth",destroyObjectWhenFinished:n},n?()=>this._deleteFromScene():null)}isPlaying(e){return this._tweens.isPlaying(e)}exists(e){return this._tweens.exists(e)}hasFinished(e){return this._tweens.hasFinished(e)}pauseTween(e){this._isActive&&this._tweens.pauseTween(e)}stopTween(e,t){this._isActive&&this._tweens.stopTween(e,t)}resumeTween(e){this._isActive&&this._tweens.resumeTween(e)}removeTween(e){this._tweens.removeTween(e)}getProgress(e){return this._tweens.getProgress(e)}getValue(e){return this._tweens.getValue(e)}onDeActivate(){this._isActive=!1}onActivate(){this._isActive=!0}}d.TweenRuntimeBehavior=q,d.registerBehavior("Tween::TweenBehavior",d.TweenRuntimeBehavior)})(gdjs||(gdjs={}));
//# sourceMappingURL=tweenruntimebehavior.js.map

