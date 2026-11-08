-- +goose Up

-- An Exercise's Secondary muscles, from the same list as its Muscle group and
-- never including it, and its Instructions: numbered steps, in order. Both
-- may be empty. The API also rejects duplicates and blank or overlong steps.
ALTER TABLE exercises
    ADD COLUMN secondary_muscles text[] NOT NULL DEFAULT '{}'
        CHECK (secondary_muscles <@ ARRAY[
            'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
            'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'full_body']::text[]),
    ADD COLUMN instructions text[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(instructions) <= 20),
    ADD CONSTRAINT exercises_secondary_muscles_exclude_primary
        CHECK (NOT (muscle_group = ANY (secondary_muscles)));

UPDATE exercises e
SET secondary_muscles = v.secondary_muscles, instructions = v.instructions
FROM (VALUES
    ('Bench Press', ARRAY['triceps', 'shoulders'], ARRAY[
        'Lie on the bench with your eyes under the bar and your feet flat on the floor.',
        'Grip the bar slightly wider than shoulder width and squeeze your shoulder blades together.',
        'Unrack the bar and hold it over your shoulders with straight arms.',
        'Lower it with control to your mid-chest, elbows about 45 degrees from your body.',
        'Press it back up until your arms are straight.']),
    ('Incline Bench Press', ARRAY['triceps', 'shoulders'], ARRAY[
        'Set the bench to 30–45 degrees and lie back with your eyes under the bar.',
        'Grip the bar slightly wider than shoulder width and pull your shoulder blades back.',
        'Unrack the bar and hold it over your upper chest with straight arms.',
        'Lower it with control to just below your collarbones.',
        'Press it back up over your upper chest until your arms are straight.']),
    ('Dumbbell Bench Press', ARRAY['triceps', 'shoulders'], ARRAY[
        'Sit on the bench with a dumbbell on each thigh, then lie back and bring them to your chest.',
        'Press them up over your chest, palms facing your feet.',
        'Lower them with control until they are level with your chest, elbows about 45 degrees from your body.',
        'Press them back up until your arms are straight, without clanking them together.']),
    ('Incline Dumbbell Press', ARRAY['triceps', 'shoulders'], ARRAY[
        'Set the bench to 30–45 degrees and sit back with a dumbbell on each thigh.',
        'Bring the dumbbells to your shoulders as you lie back.',
        'Press them up over your upper chest, palms facing your feet.',
        'Lower them with control to the sides of your upper chest.',
        'Press them back up until your arms are straight.']),
    ('Chest Fly Machine', ARRAY['shoulders'], ARRAY[
        'Set the seat so the handles are at chest height and sit with your back against the pad.',
        'Take the handles with a slight bend in your elbows.',
        'Bring the handles together in front of your chest in a wide arc, keeping your elbows fixed.',
        'Squeeze your chest, then let the handles back out with control until you feel a stretch.']),
    ('Cable Crossover', ARRAY['shoulders'], ARRAY[
        'Set both pulleys high and take a handle in each hand.',
        'Step forward into a staggered stance and lean slightly forward, elbows slightly bent.',
        'Pull the handles down and together in a wide arc until they meet in front of your hips.',
        'Squeeze your chest, then let your arms back out with control until you feel a stretch.']),
    ('Push-up', ARRAY['triceps', 'shoulders', 'abs'], ARRAY[
        'Start in a high plank with your hands slightly wider than your shoulders.',
        'Brace your abs and glutes so your body is a straight line from head to heels.',
        'Lower your chest towards the floor, elbows about 45 degrees from your body.',
        'Push the floor away until your arms are straight.']),
    ('Deadlift', ARRAY['hamstrings', 'glutes', 'forearms'], ARRAY[
        'Stand with your mid-foot under the bar, feet about hip width apart.',
        'Hinge down and grip the bar just outside your legs.',
        'Bend your knees until your shins touch the bar, then lift your chest so your back is flat.',
        'Brace and stand up, pushing the floor away and keeping the bar against your legs.',
        'Lock out with your hips and knees straight, then lower the bar the same way.']),
    ('Barbell Row', ARRAY['biceps', 'shoulders'], ARRAY[
        'Hold the bar with an overhand grip slightly wider than shoulder width.',
        'Hinge at the hips until your torso is close to parallel with the floor, back flat and knees soft.',
        'Pull the bar to your lower ribs, driving your elbows back.',
        'Squeeze your shoulder blades together, then lower the bar with control.']),
    ('Dumbbell Row', ARRAY['biceps', 'shoulders'], ARRAY[
        'Put one knee and the same hand on a bench, with the other foot on the floor.',
        'Hold a dumbbell in your free hand with your arm straight and your back flat.',
        'Pull the dumbbell to your hip, driving your elbow back.',
        'Lower it with control until your arm is straight, then switch sides after your reps.']),
    ('Lat Pulldown', ARRAY['biceps'], ARRAY[
        'Sit with your thighs under the pads and grip the bar wider than shoulder width.',
        'Lean back slightly and lift your chest.',
        'Pull the bar to your upper chest, driving your elbows down.',
        'Let it back up with control until your arms are straight.']),
    ('Seated Cable Row', ARRAY['biceps', 'shoulders'], ARRAY[
        'Sit with your feet on the platform, knees slightly bent, and take the handle.',
        'Sit tall with your arms straight in front of you.',
        'Pull the handle to your stomach, driving your elbows back and squeezing your shoulder blades.',
        'Let it back out with control without rounding your back.']),
    ('Pull-up', ARRAY['biceps', 'forearms'], ARRAY[
        'Hang from the bar with an overhand grip slightly wider than shoulder width.',
        'Pull your shoulders down and brace your abs.',
        'Pull yourself up until your chin is over the bar.',
        'Lower yourself with control until your arms are straight.']),
    ('Overhead Press', ARRAY['triceps'], ARRAY[
        'Stand with the bar on your front shoulders, hands just outside shoulder width.',
        'Brace your abs and squeeze your glutes.',
        'Press the bar straight up, moving your head back to let it pass.',
        'Lock out with the bar over your mid-foot, then lower it to your shoulders with control.']),
    ('Dumbbell Shoulder Press', ARRAY['triceps'], ARRAY[
        'Sit on a bench with its back upright, holding a dumbbell at each shoulder.',
        'Brace your abs and keep your back against the pad.',
        'Press the dumbbells up until your arms are straight overhead.',
        'Lower them with control back to your shoulders.']),
    ('Lateral Raise', ARRAY[]::text[], ARRAY[
        'Stand holding a dumbbell at each side, elbows slightly bent.',
        'Raise your arms out to the sides until they are level with your shoulders.',
        'Lead with your elbows and keep your shoulders down.',
        'Lower the dumbbells with control.']),
    ('Face Pull', ARRAY['back'], ARRAY[
        'Set a rope on a pulley at upper-chest height or higher and hold an end in each hand.',
        'Step back until your arms are straight in front of you.',
        'Pull the rope towards your face, spreading the ends apart and your elbows high.',
        'Squeeze your rear shoulders, then let the rope back out with control.']),
    ('Shoulder Press Machine', ARRAY['triceps'], ARRAY[
        'Set the seat so the handles are at shoulder height and sit with your back against the pad.',
        'Take the handles and brace your abs.',
        'Press the handles up until your arms are straight.',
        'Lower them with control back to shoulder height.']),
    ('Barbell Curl', ARRAY['forearms'], ARRAY[
        'Stand holding the bar with an underhand grip at shoulder width, arms straight.',
        'Keep your elbows at your sides.',
        'Curl the bar up towards your shoulders without swinging.',
        'Lower it with control until your arms are straight.']),
    ('Dumbbell Curl', ARRAY['forearms'], ARRAY[
        'Stand holding a dumbbell at each side, palms facing forward.',
        'Keep your elbows at your sides.',
        'Curl the dumbbells up towards your shoulders without swinging.',
        'Lower them with control until your arms are straight.']),
    ('Hammer Curl', ARRAY['forearms'], ARRAY[
        'Stand holding a dumbbell at each side, palms facing your body.',
        'Keep your elbows at your sides.',
        'Curl the dumbbells up towards your shoulders, palms still facing in.',
        'Lower them with control until your arms are straight.']),
    ('Cable Curl', ARRAY['forearms'], ARRAY[
        'Set the pulley low, attach a bar and hold it with an underhand grip.',
        'Stand tall with your elbows at your sides.',
        'Curl the bar up towards your shoulders.',
        'Lower it with control until your arms are straight.']),
    ('Triceps Pushdown', ARRAY[]::text[], ARRAY[
        'Set the pulley high and hold the bar or rope with your elbows at your sides.',
        'Lean forward slightly and keep your elbows fixed.',
        'Push down until your arms are straight.',
        'Let it back up with control until your forearms pass parallel to the floor.']),
    ('Skull Crusher', ARRAY[]::text[], ARRAY[
        'Lie on a bench holding the bar over your chest with a narrow overhand grip.',
        'Tilt your arms slightly back towards your head.',
        'Bend your elbows to lower the bar towards your forehead, keeping your upper arms still.',
        'Straighten your arms to lift it back up.']),
    ('Overhead Triceps Extension', ARRAY[]::text[], ARRAY[
        'Sit or stand holding one dumbbell overhead with both hands under the top plate.',
        'Keep your elbows pointing forward and close to your head.',
        'Lower the dumbbell behind your head by bending your elbows.',
        'Straighten your arms to press it back up.']),
    ('Dip', ARRAY['chest', 'shoulders'], ARRAY[
        'Hold the parallel bars and lift yourself until your arms are straight.',
        'Lean your torso slightly forward and brace.',
        'Lower yourself until your upper arms are about parallel to the floor.',
        'Press back up until your arms are straight.']),
    ('Wrist Curl', ARRAY[]::text[], ARRAY[
        'Sit with your forearms on your thighs, holding a dumbbell in each hand, palms up.',
        'Let your wrists hang over your knees.',
        'Lower the dumbbells by bending your wrists down.',
        'Curl your wrists up as far as they go, then lower with control.']),
    ('Farmer''s Carry', ARRAY['back', 'abs'], ARRAY[
        'Stand between two heavy dumbbells and pick them up with a neutral grip.',
        'Stand tall with your shoulders back and your abs braced.',
        'Walk forward with short, steady steps for the set distance or time.',
        'Set the dumbbells down by hinging at the hips.']),
    ('Plank', ARRAY['shoulders'], ARRAY[
        'Rest on your forearms and toes, elbows under your shoulders.',
        'Brace your abs and squeeze your glutes so your body is a straight line from head to heels.',
        'Hold the position without letting your hips sag or rise.',
        'Breathe steadily until the time is up.']),
    ('Hanging Leg Raise', ARRAY['forearms'], ARRAY[
        'Hang from a bar with your arms straight and your legs together.',
        'Brace your abs to stop yourself from swinging.',
        'Raise your legs until they are at least parallel to the floor.',
        'Lower them with control.']),
    ('Cable Crunch', ARRAY[]::text[], ARRAY[
        'Set a rope on a high pulley and kneel facing it, holding an end by each side of your head.',
        'Keep your hips still over your knees.',
        'Crunch down by curling your torso, bringing your elbows towards your thighs.',
        'Squeeze your abs, then come back up with control.']),
    ('Back Squat', ARRAY['glutes', 'hamstrings'], ARRAY[
        'Set the bar on your upper back and step back from the rack.',
        'Stand with your feet about shoulder width apart, toes slightly out.',
        'Brace and sit down between your hips, keeping your chest up and knees over your toes.',
        'Go down until your hips are at or below your knees.',
        'Drive back up through your whole foot.']),
    ('Front Squat', ARRAY['glutes', 'abs'], ARRAY[
        'Rest the bar on the front of your shoulders, elbows high, and step back from the rack.',
        'Stand with your feet about shoulder width apart, toes slightly out.',
        'Brace and squat straight down, keeping your torso upright and elbows up.',
        'Go down until your hips are at or below your knees.',
        'Drive back up through your whole foot.']),
    ('Leg Press', ARRAY['glutes', 'hamstrings'], ARRAY[
        'Sit with your back flat against the pad and your feet shoulder width apart on the platform.',
        'Release the safeties and straighten your legs without locking your knees.',
        'Lower the platform until your knees are bent about 90 degrees, keeping your lower back on the pad.',
        'Press it back up through your whole foot.']),
    ('Leg Extension', ARRAY[]::text[], ARRAY[
        'Set the seat so your knees line up with the machine''s pivot and the pad rests on your lower shins.',
        'Hold the handles and sit back.',
        'Straighten your legs until they are fully extended.',
        'Lower the pad with control.']),
    ('Goblet Squat', ARRAY['glutes'], ARRAY[
        'Hold a kettlebell by the horns against your chest.',
        'Stand with your feet slightly wider than shoulder width, toes slightly out.',
        'Squat down between your hips, keeping your chest up and elbows inside your knees.',
        'Drive back up through your whole foot.']),
    ('Romanian Deadlift', ARRAY['glutes', 'back'], ARRAY[
        'Stand holding the bar at your thighs with an overhand grip, feet hip width apart.',
        'Soften your knees and keep them there.',
        'Push your hips back, sliding the bar down your legs with your back flat.',
        'Stop when you feel a strong stretch in your hamstrings, around mid-shin.',
        'Drive your hips forward to stand back up.']),
    ('Lying Leg Curl', ARRAY['calves'], ARRAY[
        'Lie face down with the pad just above your heels and your knees just off the bench.',
        'Hold the handles and keep your hips pressed down.',
        'Curl your heels towards your glutes as far as you can.',
        'Lower the pad with control.']),
    ('Hip Thrust', ARRAY['hamstrings'], ARRAY[
        'Sit with your upper back against a bench and the bar over your hips, padded.',
        'Plant your feet hip width apart so your shins are vertical at the top.',
        'Drive through your heels to lift your hips until your body is flat from shoulders to knees.',
        'Squeeze your glutes at the top, then lower with control.']),
    ('Bulgarian Split Squat', ARRAY['quads', 'hamstrings'], ARRAY[
        'Stand in front of a bench holding a dumbbell at each side and rest one foot on it behind you.',
        'Step your front foot far enough forward that its knee stays over your foot as you lower.',
        'Lower straight down until your back knee nearly touches the floor.',
        'Drive up through your front foot, then switch legs after your reps.']),
    ('Glute Kickback', ARRAY['hamstrings'], ARRAY[
        'Attach an ankle strap to a low pulley and fasten it to one ankle.',
        'Face the machine, hold it for support and hinge slightly forward.',
        'Kick the strapped leg straight back, squeezing your glute.',
        'Bring it back with control, then switch legs after your reps.']),
    ('Banded Glute Bridge', ARRAY['hamstrings'], ARRAY[
        'Put a band just above your knees and lie on your back, knees bent and feet flat.',
        'Press your knees out against the band.',
        'Drive through your heels to lift your hips until your body is flat from shoulders to knees.',
        'Squeeze your glutes at the top, then lower with control.']),
    ('Standing Calf Raise', ARRAY[]::text[], ARRAY[
        'Stand with the pads on your shoulders and the balls of your feet on the edge of the step.',
        'Let your heels drop below the step to stretch your calves.',
        'Rise onto your toes as high as you can.',
        'Pause at the top, then lower with control.']),
    ('Seated Calf Raise', ARRAY[]::text[], ARRAY[
        'Sit with the pad on your lower thighs and the balls of your feet on the platform.',
        'Release the safety and let your heels drop to stretch your calves.',
        'Lift your heels as high as you can.',
        'Pause at the top, then lower with control.']),
    ('Kettlebell Swing', ARRAY['glutes', 'hamstrings', 'back'], ARRAY[
        'Stand with your feet a little wider than your hips, the kettlebell on the floor in front of you.',
        'Hinge and hike the kettlebell back between your legs.',
        'Snap your hips forward to swing it to chest height, arms straight and relaxed.',
        'Let it fall back between your legs as you hinge again, and keep the swings going.']),
    ('Clean and Press', ARRAY['shoulders', 'quads', 'glutes'], ARRAY[
        'Stand with the bar over your mid-foot and grip it just outside your legs.',
        'Pull it from the floor, then drive your hips forward to bring it up past your chest.',
        'Drop under it to catch it on the front of your shoulders.',
        'Stand tall, then press it straight overhead.',
        'Lower it back to your shoulders, then to the floor, with control.']),
    ('Burpee', ARRAY['chest', 'quads', 'shoulders'], ARRAY[
        'Stand with your feet shoulder width apart.',
        'Squat down and place your hands on the floor.',
        'Jump your feet back into a high plank and do a push-up.',
        'Jump your feet back to your hands.',
        'Jump up with your arms overhead.'])
) AS v (name, secondary_muscles, instructions)
WHERE e.owner_id IS NULL AND e.name = v.name;

-- +goose Down

ALTER TABLE exercises
    DROP CONSTRAINT exercises_secondary_muscles_exclude_primary,
    DROP COLUMN instructions,
    DROP COLUMN secondary_muscles;
