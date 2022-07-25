<?php



// PREPARE EVENT

# Setup request to send json via POST.
$payload = [
	// "binded" => true,
	"ep" => [
		[
			"topic" => "wid-0001/rndm"
		]
	],
	"e" => [
		"type" => "random_number",
		"detail" => rand()
	]
];



// EMIT EVENT

$ch = curl_init( "http://localhost:1010/event" );
curl_setopt( $ch, CURLOPT_POSTFIELDS, json_encode($payload) );
curl_setopt( $ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
# Return response instead of printing.
curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
# Send request.
$result = curl_exec($ch);
curl_close($ch);
# Print response.
// echo "ok";

echo(json_encode($payload));

exit();